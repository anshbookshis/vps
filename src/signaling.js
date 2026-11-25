import { APP_ID, PUBLIC_MQTT_BROKERS, PUBLIC_NOSTR_RELAYS } from './config.js';
import { decryptPayload, deriveRoomKey, deriveRoomTopicHash, encryptPayload } from './crypto.js';
import { MqttWsClient } from './mqtt-ws.js';

const SEEN_TTL_MS = 30_000;

/**
 * Pure helper for bounded message deduplication across multiple signaling transports.
 */
export class MessageDeduplicator {
  constructor(ttlMs = SEEN_TTL_MS, maxEntries = 1000) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    /** @type {Map<string, number>} */
    this.seen = new Map();
  }

  hasSeen(id, now = Date.now()) {
    if (!id) return false;
    const prev = this.seen.get(id);
    if (prev !== undefined && now - prev < this.ttlMs) {
      return true;
    }
    this.seen.set(id, now);
    if (this.seen.size > this.maxEntries) {
      for (const [key, ts] of this.seen.entries()) {
        if (now - ts >= this.ttlMs || this.seen.size > this.maxEntries) {
          this.seen.delete(key);
        } else {
          break;
        }
      }
    }
    return false;
  }
}

/**
 * Unified multi-transport WebRTC signaling client.
 * Combines:
 *  - Self-hosted WebSocket `/ws` (when served by server.js)
 *  - Free public MQTT-over-WSS brokers (serverless static hosting)
 *  - Free public Nostr relays via Trystero ESM CDN (optional / fallback)
 *  - Same-browser BroadcastChannel (zero-network multi-tab calls)
 */
export class RoomSignaling extends EventTarget {
  constructor({ roomId, peerId, name, passphrase = '', mode = 'auto' }) {
    super();
    this.roomId = roomId;
    this.peerId = peerId;
    this.name = name || 'Guest';
    this.passphrase = passphrase;
    this.mode = mode;

    this.roomKey = null;
    this.topic = '';
    this.dedup = new MessageDeduplicator();
    this.closed = false;

    this.ws = null;
    this.mqttClient = null;
    this.broadcast = null;
    this.nostrRoom = null;
    this.nostrSend = null;

    this.knownPeers = new Map();
    this.activeTransports = new Set();
    this.presenceTimer = null;
  }

  emitEvent(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  getTransportSummary() {
    if (this.activeTransports.size === 0) return 'Offline / Manual';
    return Array.from(this.activeTransports).join(' + ');
  }

  setTransportState(label, active) {
    if (active) {
      this.activeTransports.add(label);
    } else {
      this.activeTransports.delete(label);
    }
    this.emitEvent('transport-change', {
      transports: Array.from(this.activeTransports),
      summary: this.getTransportSummary(),
    });
  }

  async start() {
    this.roomKey = this.passphrase ? await deriveRoomKey(this.passphrase, this.roomId) : null;
    const topicHash = await deriveRoomTopicHash(this.roomId, this.passphrase);
    this.topic = `openline/v1/${topicHash}`;

    const localTasks = [];

    if (this.mode !== 'manual') {
      this.startBroadcastChannel();
    }

    if (this.mode === 'auto' || this.mode === 'server') {
      localTasks.push(this.connectLocalWs());
    }

    // Wait briefly only for local WebSocket so joining a room feels instant
    await Promise.allSettled(localTasks);

    if (this.mode === 'auto' || this.mode === 'mqtt') {
      this.connectPublicMqtt()
        .then((connected) => {
          if (connected && !this.closed && this.mqttClient?.connected) {
            this.announcePresence('hello').catch(() => {});
          } else if (!connected && !this.closed && this.mode === 'auto' && !this.ws) {
            // Static host fallback when public MQTT brokers are unreachable
            this.connectPublicNostr().then(() => {
              if (!this.closed && this.nostrRoom) {
                this.announcePresence('hello').catch(() => {});
              }
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    if (this.mode === 'nostr') {
      this.connectPublicNostr().then(() => {
        if (!this.closed && this.nostrRoom) {
          this.announcePresence('hello').catch(() => {});
        }
      }).catch(() => {});
    }

    if (this.mode !== 'manual') {
      await this.announcePresence('hello');
      this.presenceTimer = setInterval(() => {
        if (!this.closed) {
          this.announcePresence('heartbeat').catch(() => {});
          this.pruneStalePeers();
        }
      }, 10_000);
    }
  }

  startBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    this.broadcast = new BroadcastChannel(`openline-bc-${this.topic}`);
    this.setTransportState('Local Tabs', true);
    this.broadcast.onmessage = (event) => {
      this.handleRawEnvelope(event.data, 'Local Tabs').catch(() => {});
    };
  }

  async connectLocalWs() {
    if (typeof WebSocket === 'undefined' || !globalThis.location?.host) return;
    const hostname = globalThis.location.hostname || '';
    if (hostname.endsWith('.github.io') || hostname.endsWith('.pages.dev') || hostname.endsWith('.netlify.app')) {
      return;
    }

    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const origin = globalThis.location.origin && globalThis.location.origin !== 'null'
      ? globalThis.location.origin
      : `${globalThis.location.protocol || 'http:'}//${globalThis.location.host}`;

    if (typeof fetch === 'function') {
      try {
        const res = await fetch(`${origin}/health`, { cache: 'no-store' });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) return;
        const body = await res.json();
        if (!body?.ok) return;
      } catch {
        return;
      }
    }

    const wsUrl = `${protocol}//${globalThis.location.host}/ws`;

    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
        done();
      }, 2500);

      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        clearTimeout(timeout);
        done();
        return;
      }

      ws.addEventListener('open', async () => {
        clearTimeout(timeout);
        if (this.closed) {
          ws.close();
          done();
          return;
        }
        this.ws = ws;
        this.setTransportState('WS Server', true);
        ws.send(JSON.stringify({
          type: 'join',
          roomId: this.topic,
          peerId: this.peerId,
          name: this.roomKey ? 'Encrypted Peer' : this.name,
        }));
        done();
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.addEventListener('error', () => {
        clearTimeout(timeout);
        done();
      });

      ws.addEventListener('close', () => {
        clearTimeout(timeout);
        if (this.ws === ws) {
          this.ws = null;
          this.setTransportState('WS Server', false);
        }
        done();
      });
    });
  }

  async connectPublicMqtt() {
    if (typeof WebSocket === 'undefined') return;

    for (const brokerUrl of PUBLIC_MQTT_BROKERS) {
      if (this.closed) return;
      const client = new MqttWsClient(brokerUrl, {
        clientId: `ol_${this.peerId}_${Math.random().toString(36).slice(2, 6)}`,
        onMessage: (_topic, payloadText) => {
          try {
            const parsed = JSON.parse(payloadText);
            this.handleRawEnvelope(parsed, 'Public MQTT').catch(() => {});
          } catch {
            // ignore non-JSON traffic on shared broker
          }
        },
        onClose: () => {
          if (this.mqttClient === client) {
            this.setTransportState('Public MQTT', false);
          }
        },
      });

      try {
        await client.connect(5000);
        if (this.closed) {
          client.close();
          return;
        }
        this.mqttClient = client;
        client.subscribe(this.topic);
        this.setTransportState('Public MQTT', true);
        return true;
      } catch {
        client.close();
      }
    }
    return false;
  }

  async connectPublicNostr() {
    const cdnUrls = [
      'https://esm.sh/@trystero-p2p/nostr@0.26.0',
      'https://cdn.jsdelivr.net/npm/@trystero-p2p/nostr@0.26.0/+esm',
    ];

    for (const url of cdnUrls) {
      if (this.closed) return;
      try {
        const mod = await import(/* @vite-ignore */ url);
        if (typeof mod?.joinRoom !== 'function') continue;

        const room = mod.joinRoom(
          {
            appId: APP_ID,
            relayUrls: PUBLIC_NOSTR_RELAYS,
            password: this.passphrase || undefined,
          },
          this.topic
        );
        const [sendSignal, onSignal] = room.makeAction('ol-sig');
        onSignal((envelope) => {
          this.handleRawEnvelope(envelope, 'Nostr Relays').catch(() => {});
        });

        room.onPeerLeave(() => {
          // Peer leave also handled by explicit goodbye / heartbeat timeout
        });

        this.nostrRoom = room;
        this.nostrSend = sendSignal;
        this.setTransportState('Nostr Relays', true);
        return;
      } catch {
        // try next CDN
      }
    }
  }

  handleServerMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'room-peers' && Array.isArray(msg.peers)) {
      // Trigger presence hello so name & handshake sync cleanly
      this.announcePresence('hello').catch(() => {});
      return;
    }
    if (msg.type === 'peer-left' && msg.peerId) {
      this.removePeer(msg.peerId);
      return;
    }
    if (msg.type === 'envelope' && msg.envelope) {
      this.handleRawEnvelope(msg.envelope, 'WS Server').catch(() => {});
    }
  }

  async handleRawEnvelope(raw, sourceLabel) {
    if (this.closed || !raw || typeof raw !== 'object') return;
    if (raw.sender === this.peerId) return;

    let payload = raw.payload;
    if (this.roomKey || raw.payload?.__e2e) {
      try {
        payload = await decryptPayload(raw.payload, this.roomKey);
      } catch {
        // Ignore messages encrypted under another passphrase or malformed packets
        return;
      }
    }

    if (!payload || typeof payload !== 'object') return;
    if (payload.to && payload.to !== this.peerId) return;

    const msgId = raw.id || `${raw.sender}:${payload.kind}:${payload.seq || ''}`;
    if (this.dedup.hasSeen(msgId)) return;

    const fromId = raw.sender;
    if (!fromId) return;

    if (payload.kind === 'presence') {
      const isNew = !this.knownPeers.has(fromId);
      this.knownPeers.set(fromId, {
        peerId: fromId,
        name: payload.name || 'Guest',
        lastSeen: Date.now(),
        source: sourceLabel,
      });

      if (isNew) {
        this.emitEvent('peer-joined', {
          peerId: fromId,
          name: payload.name || 'Guest',
          source: sourceLabel,
        });
      }

      if (payload.phase === 'hello') {
        await this.sendPayload({
          kind: 'presence',
          phase: 'ack',
          name: this.name,
          to: fromId,
        });
      }
      return;
    }

    if (payload.kind === 'goodbye') {
      this.removePeer(fromId);
      return;
    }

    // Ensure peer is registered if a signal arrives slightly ahead of presence
    if (!this.knownPeers.has(fromId)) {
      this.knownPeers.set(fromId, {
        peerId: fromId,
        name: payload.name || 'Guest',
        lastSeen: Date.now(),
        source: sourceLabel,
      });
      this.emitEvent('peer-joined', {
        peerId: fromId,
        name: payload.name || 'Guest',
        source: sourceLabel,
      });
    } else {
      this.knownPeers.get(fromId).lastSeen = Date.now();
    }

    if (payload.kind === 'signal') {
      this.emitEvent('signal', {
        from: fromId,
        data: payload.data,
      });
    } else if (payload.kind === 'chat') {
      this.emitEvent('chat', {
        from: fromId,
        name: payload.name || this.knownPeers.get(fromId)?.name || 'Guest',
        text: payload.text,
        ts: payload.ts || Date.now(),
      });
    } else if (payload.kind === 'state') {
      this.emitEvent('peer-state', {
        from: fromId,
        state: payload.state,
      });
    }
  }

  removePeer(peerId) {
    if (!this.knownPeers.has(peerId)) return;
    const peer = this.knownPeers.get(peerId);
    this.knownPeers.delete(peerId);
    this.emitEvent('peer-left', { peerId, name: peer?.name || 'Guest' });
  }

  pruneStalePeers() {
    const now = Date.now();
    for (const [peerId, info] of this.knownPeers.entries()) {
      if (now - info.lastSeen > 32_000) {
        this.removePeer(peerId);
      }
    }
  }

  async sendPayload(payload) {
    if (this.closed) return;
    const msgId = `${this.peerId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const wrappedPayload = this.roomKey
      ? await encryptPayload(payload, this.roomKey)
      : payload;

    const envelope = {
      id: msgId,
      sender: this.peerId,
      payload: wrappedPayload,
    };

    if (this.broadcast) {
      try {
        this.broadcast.postMessage(envelope);
      } catch {
        // ignore
      }
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'envelope',
        to: payload.to || null,
        envelope,
      }));
    }

    if (this.mqttClient?.connected) {
      this.mqttClient.publish(this.topic, envelope);
    }

    if (this.nostrSend) {
      try {
        this.nostrSend(envelope);
      } catch {
        // ignore
      }
    }
  }

  announcePresence(phase = 'hello') {
    return this.sendPayload({
      kind: 'presence',
      phase,
      name: this.name,
    });
  }

  sendSignal(to, data) {
    return this.sendPayload({
      kind: 'signal',
      to,
      name: this.name,
      data,
    });
  }

  sendState(state) {
    return this.sendPayload({
      kind: 'state',
      state,
    });
  }

  sendChat(text) {
    return this.sendPayload({
      kind: 'chat',
      name: this.name,
      text,
      ts: Date.now(),
    });
  }

  async close() {
    if (this.closed) return;
    clearInterval(this.presenceTimer);
    try {
      await this.sendPayload({ kind: 'goodbye' });
    } catch {
      // ignore
    }
    this.closed = true;

    try {
      this.ws?.send(JSON.stringify({ type: 'leave' }));
      this.ws?.close();
    } catch {
      // ignore
    }
    this.mqttClient?.close();
    try {
      this.broadcast?.close();
    } catch {
      // ignore
    }
    try {
      this.nostrRoom?.leave();
    } catch {
      // ignore
    }

    this.activeTransports.clear();
    this.knownPeers.clear();
  }
}
