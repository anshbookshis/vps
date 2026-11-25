import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 3000);
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Encode a UTF-8 string or Buffer into an unmasked server-to-client RFC 6455 frame.
 * @param {string|Buffer} payload
 * @param {number} opcode 0x1 text, 0x8 close, 0x9 ping, 0xA pong
 */
export function encodeWsFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const len = data.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, data]);
}

/**
 * Incrementally parse RFC 6455 WebSocket frames from an arbitrary byte buffer.
 * Returns parsed frames plus any trailing incomplete bytes.
 */
export function decodeWsFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const fin = (firstByte & 0x80) !== 0;
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let cursor = offset + 2;

    if (payloadLen === 126) {
      if (cursor + 2 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (payloadLen === 127) {
      if (cursor + 8 > buffer.length) break;
      const bigLen = buffer.readBigUInt64BE(cursor);
      if (bigLen > BigInt(2 * 1024 * 1024)) {
        throw new RangeError('WebSocket frame exceeds 2 MiB limit');
      }
      payloadLen = Number(bigLen);
      cursor += 8;
    }

    const maskLen = masked ? 4 : 0;
    if (cursor + maskLen + payloadLen > buffer.length) break;

    let maskKey = null;
    if (masked) {
      maskKey = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }

    const payload = Buffer.from(buffer.subarray(cursor, cursor + payloadLen));
    if (maskKey) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] ^= maskKey[i & 3];
      }
    }

    frames.push({ fin, opcode, payload });
    offset = cursor + payloadLen;
  }

  return { frames, remaining: buffer.subarray(offset) };
}

function sendJson(socket, message) {
  if (!socket || socket.destroyed) return;
  try {
    socket.write(encodeWsFrame(JSON.stringify(message), 0x1));
  } catch {
    // Socket may close mid-write
  }
}

/**
 * Create an HTTP static server paired with an RFC 6455 WebSocket signaling hub at `/ws`.
 */
export function createOpenLineServer(rootDir = ROOT_DIR) {
  const normalizedRoot = path.resolve(rootDir);
  /** @type {Map<string, Map<string, { socket: import('node:net').Socket, peerId: string, name: string }>>} */
  const rooms = new Map();
  const sockets = new Set();

  const server = http.createServer((req, res) => {
    const rawUrl = (req.url || '/').split('?')[0];

    if (rawUrl === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, clients: sockets.size }));
      return;
    }

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(rawUrl);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    const relPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const targetPath = path.resolve(normalizedRoot, relPath);

    if (targetPath !== normalizedRoot && !targetPath.startsWith(normalizedRoot + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.stat(targetPath, (statErr, stats) => {
      if (statErr || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      });
      fs.createReadStream(targetPath).pipe(res);
    });
  });

  function broadcastRoom(roomId, payload, excludePeerId = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const [peerId, client] of room.entries()) {
      if (peerId !== excludePeerId) {
        sendJson(client.socket, payload);
      }
    }
  }

  function leaveCurrentRoom(clientState) {
    const { roomId, peerId } = clientState;
    if (!roomId || !peerId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const existing = room.get(peerId);
    if (existing && existing.socket === clientState.socket) {
      room.delete(peerId);
      broadcastRoom(roomId, { type: 'peer-left', roomId, peerId });
      if (room.size === 0) {
        rooms.delete(roomId);
      }
    }
    clientState.roomId = null;
  }

  function handleWsMessage(clientState, rawText) {
    let msg;
    try {
      msg = JSON.parse(rawText);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'ping') {
      sendJson(clientState.socket, { type: 'pong', ts: msg.ts || Date.now() });
      return;
    }

    if (msg.type === 'join') {
      const roomId = String(msg.roomId || '').trim().slice(0, 64);
      const peerId = String(msg.peerId || '').trim().slice(0, 64);
      const name = String(msg.name || 'Guest').trim().slice(0, 48);
      if (!roomId || !peerId) return;

      if (clientState.roomId && clientState.roomId !== roomId) {
        leaveCurrentRoom(clientState);
      }

      clientState.roomId = roomId;
      clientState.peerId = peerId;
      clientState.name = name;

      let room = rooms.get(roomId);
      if (!room) {
        room = new Map();
        rooms.set(roomId, room);
      }

      const peers = [];
      for (const [existingPeerId, member] of room.entries()) {
        if (existingPeerId !== peerId) {
          peers.push({ peerId: existingPeerId, name: member.name, meta: member.meta || null });
        }
      }

      room.set(peerId, { socket: clientState.socket, peerId, name, meta: msg.meta || null });
      sendJson(clientState.socket, { type: 'room-peers', roomId, peers });
      broadcastRoom(roomId, { type: 'peer-joined', roomId, peerId, name, meta: msg.meta || null }, peerId);
      return;
    }

    if (msg.type === 'leave') {
      leaveCurrentRoom(clientState);
      return;
    }

    const roomId = clientState.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    // Directed signaling or room broadcast (encrypted or plaintext envelope)
    if (msg.to) {
      const target = room.get(String(msg.to));
      if (target) {
        sendJson(target.socket, { ...msg, from: clientState.peerId, roomId });
      }
    } else {
      broadcastRoom(roomId, { ...msg, from: clientState.peerId, roomId }, clientState.peerId);
    }
  }

  server.on('upgrade', (req, socket) => {
    const pathname = (req.url || '/').split('?')[0];
    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    const upgradeHeader = String(req.headers.upgrade || '').toLowerCase();
    if (!key || upgradeHeader !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const acceptKey = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '',
        '',
      ].join('\r\n')
    );

    socket.setNoDelay(true);
    sockets.add(socket);

    const clientState = { socket, roomId: null, peerId: null, name: 'Guest' };
    let pending = Buffer.alloc(0);
    let fragments = [];

    const heartbeat = setInterval(() => {
      if (!socket.destroyed) {
        try {
          socket.write(encodeWsFrame(Buffer.alloc(0), 0x9));
        } catch {
          // ignore
        }
      }
    }, 25000);
    heartbeat.unref?.();

    const cleanup = () => {
      clearInterval(heartbeat);
      sockets.delete(socket);
      leaveCurrentRoom(clientState);
    };

    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      let decoded;
      try {
        decoded = decodeWsFrames(pending);
      } catch {
        socket.destroy();
        return;
      }
      pending = decoded.remaining;

      for (const frame of decoded.frames) {
        if (frame.opcode === 0x8) {
          try {
            socket.write(encodeWsFrame(Buffer.alloc(0), 0x8));
          } catch {
            // ignore
          }
          socket.end();
          return;
        }
        if (frame.opcode === 0x9) {
          socket.write(encodeWsFrame(frame.payload, 0xA));
          continue;
        }
        if (frame.opcode === 0xA) {
          continue;
        }
        if (frame.opcode === 0x1 || frame.opcode === 0x0) {
          fragments.push(frame.payload);
          if (frame.fin) {
            const fullText = Buffer.concat(fragments).toString('utf8');
            fragments = [];
            handleWsMessage(clientState, fullText);
          }
        }
      }
    });

    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });

  const originalClose = server.close.bind(server);
  server.close = (cb) => {
    for (const sock of sockets) {
      sock.destroy();
    }
    sockets.clear();
    rooms.clear();
    return originalClose(cb);
  };

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createOpenLineServer();
  server.listen(DEFAULT_PORT, '0.0.0.0', () => {
    console.log(`OpenLine Studio listening on http://localhost:${DEFAULT_PORT}`);
  });
}
