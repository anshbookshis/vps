const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encode MQTT 3.1.1 variable-byte Remaining Length field (1–4 bytes).
 */
export function encodeRemainingLength(length) {
  const bytes = [];
  let x = length;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) encodedByte |= 0x80;
    bytes.push(encodedByte);
  } while (x > 0);
  return new Uint8Array(bytes);
}

export function decodeRemainingLength(bytes, offset = 0) {
  let multiplier = 1;
  let value = 0;
  let cursor = offset;
  let encodedByte = 0;

  do {
    if (cursor >= bytes.length) return null;
    encodedByte = bytes[cursor++];
    value += (encodedByte & 127) * multiplier;
    if (multiplier > 128 * 128 * 128) {
      throw new RangeError('Malformed MQTT remaining length');
    }
    multiplier *= 128;
  } while ((encodedByte & 128) !== 0);

  return { value, nextOffset: cursor };
}

function encodeMqttString(str) {
  const utf8 = encoder.encode(str);
  const out = new Uint8Array(2 + utf8.length);
  out[0] = (utf8.length >> 8) & 0xff;
  out[1] = utf8.length & 0xff;
  out.set(utf8, 2);
  return out;
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const arr of arrays) {
    out.set(arr, pos);
    pos += arr.length;
  }
  return out;
}

export function buildConnectPacket(clientId, keepAliveSec = 30) {
  const protocolName = encodeMqttString('MQTT');
  const protocolLevel = new Uint8Array([4]); // MQTT 3.1.1
  const connectFlags = new Uint8Array([0x02]); // Clean Session
  const keepAlive = new Uint8Array([(keepAliveSec >> 8) & 0xff, keepAliveSec & 0xff]);
  const payload = encodeMqttString(clientId);

  const variableAndPayload = concatBytes(protocolName, protocolLevel, connectFlags, keepAlive, payload);
  const remLen = encodeRemainingLength(variableAndPayload.length);
  return concatBytes(new Uint8Array([0x10]), remLen, variableAndPayload);
}

export function buildSubscribePacket(packetId, topic) {
  const idBytes = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const topicBytes = encodeMqttString(topic);
  const qos = new Uint8Array([0x00]); // QoS 0
  const body = concatBytes(idBytes, topicBytes, qos);
  const remLen = encodeRemainingLength(body.length);
  return concatBytes(new Uint8Array([0x82]), remLen, body);
}

export function buildPublishPacket(topic, message) {
  const topicBytes = encodeMqttString(topic);
  const payloadBytes = typeof message === 'string' ? encoder.encode(message) : message;
  const body = concatBytes(topicBytes, payloadBytes);
  const remLen = encodeRemainingLength(body.length);
  return concatBytes(new Uint8Array([0x30]), remLen, body);
}

export function buildPingReqPacket() {
  return new Uint8Array([0xc0, 0x00]);
}

export function buildDisconnectPacket() {
  return new Uint8Array([0xe0, 0x00]);
}

/**
 * Parse complete MQTT 3.1.1 packets from a byte buffer.
 */
export function parseMqttPackets(buffer) {
  const packets = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const header = buffer[offset];
    const packetType = (header >> 4) & 0x0f;
    const flags = header & 0x0f;
    const lenInfo = decodeRemainingLength(buffer, offset + 1);
    if (!lenInfo) break;

    const totalEnd = lenInfo.nextOffset + lenInfo.value;
    if (totalEnd > buffer.length) break;

    const body = buffer.subarray(lenInfo.nextOffset, totalEnd);
    if (packetType === 2) {
      // CONNACK
      packets.push({ type: 'CONNACK', returnCode: body[1] ?? 1 });
    } else if (packetType === 3) {
      // PUBLISH
      const topicLen = ((body[0] || 0) << 8) | (body[1] || 0);
      const topic = decoder.decode(body.subarray(2, 2 + topicLen));
      let payloadStart = 2 + topicLen;
      const qos = (flags >> 1) & 0x03;
      if (qos > 0) payloadStart += 2;
      const payload = decoder.decode(body.subarray(payloadStart));
      packets.push({ type: 'PUBLISH', topic, payload });
    } else if (packetType === 9) {
      packets.push({ type: 'SUBACK' });
    } else if (packetType === 13) {
      packets.push({ type: 'PINGRESP' });
    }

    offset = totalEnd;
  }

  return { packets, remaining: buffer.subarray(offset) };
}

/**
 * Lightweight zero-dependency MQTT 3.1.1 over WebSocket client for free public brokers.
 */
export class MqttWsClient {
  constructor(url, { clientId, onConnect, onMessage, onClose } = {}) {
    this.url = url;
    this.clientId = clientId || `openline_${Math.random().toString(36).slice(2, 10)}`;
    this.onConnect = onConnect;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.ws = null;
    this.connected = false;
    this.closed = false;
    this.packetId = 1;
    this.buffer = new Uint8Array(0);
    this.pingTimer = null;
  }

  connect(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('Client closed'));
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.close();
          reject(new Error(`MQTT broker timeout: ${this.url}`));
        }
      }, timeoutMs);

      try {
        this.ws = new WebSocket(this.url, 'mqtt');
        this.ws.binaryType = 'arraybuffer';
      } catch (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }

      this.ws.addEventListener('open', () => {
        this.ws.send(buildConnectPacket(this.clientId, 25));
      });

      this.ws.addEventListener('message', (event) => {
        const chunk = new Uint8Array(event.data);
        this.buffer = concatBytes(this.buffer, chunk);
        let parsed;
        try {
          parsed = parseMqttPackets(this.buffer);
        } catch {
          this.close();
          return;
        }
        this.buffer = parsed.remaining;

        for (const pkt of parsed.packets) {
          if (pkt.type === 'CONNACK') {
            clearTimeout(timer);
            if (pkt.returnCode === 0) {
              this.connected = true;
              this.pingTimer = setInterval(() => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                  this.ws.send(buildPingReqPacket());
                }
              }, 20000);
              if (!settled) {
                settled = true;
                this.onConnect?.();
                resolve(this);
              }
            } else if (!settled) {
              settled = true;
              this.close();
              reject(new Error(`MQTT CONNACK rejected (${pkt.returnCode})`));
            }
          } else if (pkt.type === 'PUBLISH') {
            this.onMessage?.(pkt.topic, pkt.payload);
          }
        }
      });

      this.ws.addEventListener('error', () => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          reject(new Error(`MQTT WebSocket error: ${this.url}`));
        }
      });

      this.ws.addEventListener('close', () => {
        clearTimeout(timer);
        clearInterval(this.pingTimer);
        this.connected = false;
        if (!settled) {
          settled = true;
          reject(new Error(`MQTT WebSocket closed before CONNACK: ${this.url}`));
        }
        this.onClose?.();
      });
    });
  }

  subscribe(topic) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return;
    const id = this.packetId++;
    if (this.packetId > 65530) this.packetId = 1;
    this.ws.send(buildSubscribePacket(id, topic));
  }

  publish(topic, payload) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return;
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.ws.send(buildPublishPacket(topic, text));
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(buildDisconnectPacket());
        }
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.connected = false;
  }
}
