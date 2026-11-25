import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { once } from 'node:events';

import { createOpenLineServer, decodeWsFrames, encodeWsFrame } from '../server.js';
import { icons } from '../src/ui-icons.js';
import {
  DEFAULT_STUN_SERVERS,
  generateRoomCode,
  getIceConfiguration,
  normalizeRoomCode,
} from '../src/config.js';
import {
  decryptPayload,
  deriveRoomKey,
  deriveRoomTopicHash,
  encryptPayload,
} from '../src/crypto.js';
import {
  buildConnectPacket,
  buildPublishPacket,
  buildSubscribePacket,
  decodeRemainingLength,
  encodeRemainingLength,
  parseMqttPackets,
} from '../src/mqtt-ws.js';
import { MessageDeduplicator, RoomSignaling } from '../src/signaling.js';
import { isPolitePeer } from '../src/rtc.js';

function createMaskedClientFrame(payload, opcode = 0x1) {
  const data = Buffer.from(payload, 'utf8');
  const mask = crypto.randomBytes(4);
  let header;
  if (data.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | data.length;
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  }
  const masked = Buffer.from(data);
  for (let i = 0; i < masked.length; i += 1) {
    masked[i] ^= mask[i & 3];
  }
  return Buffer.concat([header, mask, masked]);
}

async function connectTestWs(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages = [];
  const waiters = [];

  ws.addEventListener('message', (event) => {
    messages.push(JSON.parse(event.data));
    if (waiters.length > 0 && messages.length > 0) {
      waiters.shift()();
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  return {
    send(obj) {
      ws.send(JSON.stringify(obj));
    },
    async nextMessage() {
      if (messages.length > 0) return messages.shift();
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('WS message timeout')), 2000);
        waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
      return messages.shift();
    },
    close() {
      ws.close();
    },
  };
}

test('HTTP server serves static files, health endpoint, and blocks traversal', async () => {
  const server = createOpenLineServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    const healthJson = await health.json();
    assert.equal(healthJson.ok, true);

    const index = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(index.status, 200);
    const html = await index.text();
    assert.match(html, /OpenLine/);

    const traversal = await fetch(`http://127.0.0.1:${port}/..%2Fpackage.json`);
    assert.equal(traversal.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('RFC 6455 WebSocket server coordinates room join, directed signaling, and leave', async () => {
  const server = createOpenLineServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  const clientA = await connectTestWs(port);
  const clientB = await connectTestWs(port);

  try {
    clientA.send({ type: 'join', roomId: 'room-alpha', peerId: 'peer-a', name: 'Alice' });
    const aPeers = await clientA.nextMessage();
    assert.deepEqual(aPeers, { type: 'room-peers', roomId: 'room-alpha', peers: [] });

    clientB.send({ type: 'join', roomId: 'room-alpha', peerId: 'peer-b', name: 'Bob' });
    const bPeers = await clientB.nextMessage();
    assert.equal(bPeers.type, 'room-peers');
    assert.equal(bPeers.peers.length, 1);
    assert.equal(bPeers.peers[0].peerId, 'peer-a');

    const aJoinedNotice = await clientA.nextMessage();
    assert.equal(aJoinedNotice.type, 'peer-joined');
    assert.equal(aJoinedNotice.peerId, 'peer-b');

    clientA.send({
      type: 'envelope',
      to: 'peer-b',
      envelope: { id: 'msg1', sender: 'peer-a', payload: { kind: 'signal', data: { sdp: 'v=0' } } },
    });
    const bSignal = await clientB.nextMessage();
    assert.equal(bSignal.type, 'envelope');
    assert.equal(bSignal.from, 'peer-a');
    assert.equal(bSignal.envelope.payload.data.sdp, 'v=0');

    clientB.close();
    const aLeftNotice = await clientA.nextMessage();
    assert.equal(aLeftNotice.type, 'peer-left');
    assert.equal(aLeftNotice.peerId, 'peer-b');
  } finally {
    clientA.close();
    clientB.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('RFC 6455 frame codec handles multi-byte payload lengths', () => {
  const payload = 'x'.repeat(300);
  const serverFrame = encodeWsFrame(payload, 0x1);
  const decodedServer = decodeWsFrames(serverFrame);
  assert.equal(decodedServer.frames.length, 1);
  assert.equal(decodedServer.frames[0].payload.toString('utf8'), payload);

  const clientFrame = createMaskedClientFrame(payload, 0x1);
  const decodedClient = decodeWsFrames(clientFrame);
  assert.equal(decodedClient.frames.length, 1);
  assert.equal(decodedClient.frames[0].payload.toString('utf8'), payload);
});

test('MQTT 3.1.1 binary packet encoder and parser handle multi-byte lengths and publish packets', () => {
  for (const size of [0, 127, 128, 16384, 65535]) {
    const encoded = encodeRemainingLength(size);
    const decoded = decodeRemainingLength(encoded);
    assert.equal(decoded.value, size);
  }

  const connectPkt = buildConnectPacket('openline-test-1');
  assert.equal(connectPkt[0], 0x10);

  const subPkt = buildSubscribePacket(42, 'openline/v1/abc');
  assert.equal(subPkt[0], 0x82);

  const longMsg = JSON.stringify({ hello: 'world', pad: 'a'.repeat(240) });
  const pubPkt = buildPublishPacket('openline/v1/abc', longMsg);
  const parsed = parseMqttPackets(pubPkt);
  assert.equal(parsed.remaining.length, 0);
  assert.equal(parsed.packets.length, 1);
  assert.equal(parsed.packets[0].type, 'PUBLISH');
  assert.equal(parsed.packets[0].topic, 'openline/v1/abc');
  assert.equal(parsed.packets[0].payload, longMsg);
});

test('WebCrypto E2E passphrase key derivation encrypts, decrypts, and rejects wrong passphrases', async () => {
  const topicA = await deriveRoomTopicHash('K7M-92P', 'secret');
  const topicB = await deriveRoomTopicHash('K7M-92P', '');
  assert.notEqual(topicA, topicB);
  assert.equal(topicA.length, 24);

  const keyRight = await deriveRoomKey('studio-pass-42', 'K7M-92P');
  const keyWrong = await deriveRoomKey('wrong-pass', 'K7M-92P');

  const secretPayload = { kind: 'signal', data: { candidate: 'candidate:1 1 udp 1234' } };
  const envelope = await encryptPayload(secretPayload, keyRight);
  assert.equal(envelope.__e2e, 1);

  const decrypted = await decryptPayload(envelope, keyRight);
  assert.deepEqual(decrypted, secretPayload);

  await assert.rejects(() => decryptPayload(envelope, keyWrong));
  await assert.rejects(() => decryptPayload(envelope, null));
});

test('Config, deduplication, and Perfect Negotiation politeness helpers behave deterministically', () => {
  const code = generateRoomCode();
  assert.match(code, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  assert.equal(normalizeRoomCode('  k7m-92p! '), 'K7M-92P');

  const ice = getIceConfiguration([{ urls: 'turn:example.org:3478' }]);
  assert.equal(ice.iceServers.length, DEFAULT_STUN_SERVERS.length + 1);

  const dedup = new MessageDeduplicator(1000, 10);
  assert.equal(dedup.hasSeen('m1', 100), false);
  assert.equal(dedup.hasSeen('m1', 200), true);
  assert.equal(dedup.hasSeen('m1', 1500), false);

  assert.notEqual(isPolitePeer('alpha', 'beta'), isPolitePeer('beta', 'alpha'));
});

test('RoomSignaling encrypts and exchanges presence, chat, and WebRTC signals over WS server', async () => {
  const server = createOpenLineServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  const prevLocation = globalThis.location;
  globalThis.location = { protocol: 'http:', host: `127.0.0.1:${port}` };

  const sigA = new RoomSignaling({
    roomId: 'R9K-42B',
    peerId: 'peer-001',
    name: 'Alice',
    passphrase: 'studio-secret-pass',
    mode: 'server',
  });
  const sigB = new RoomSignaling({
    roomId: 'R9K-42B',
    peerId: 'peer-002',
    name: 'Bob',
    passphrase: 'studio-secret-pass',
    mode: 'server',
  });

  try {
    const joinedOnA = new Promise((resolve) =>
      sigA.addEventListener('peer-joined', (e) => resolve(e.detail), { once: true })
    );
    const joinedOnB = new Promise((resolve) =>
      sigB.addEventListener('peer-joined', (e) => resolve(e.detail), { once: true })
    );
    const signalOnB = new Promise((resolve) =>
      sigB.addEventListener('signal', (e) => resolve(e.detail), { once: true })
    );
    const chatOnA = new Promise((resolve) =>
      sigA.addEventListener('chat', (e) => resolve(e.detail), { once: true })
    );

    await sigA.start();
    await sigB.start();

    const [peerBInfo, peerAInfo] = await Promise.all([joinedOnA, joinedOnB]);
    assert.equal(peerBInfo.peerId, 'peer-002');
    assert.equal(peerBInfo.name, 'Bob');
    assert.equal(peerAInfo.peerId, 'peer-001');
    assert.equal(peerAInfo.name, 'Alice');

    await sigA.sendSignal('peer-002', { description: { type: 'offer', sdp: 'v=0-encrypted' } });
    const sigMsg = await signalOnB;
    assert.equal(sigMsg.from, 'peer-001');
    assert.equal(sigMsg.data.description.sdp, 'v=0-encrypted');

    await sigB.sendChat('Hello over encrypted signaling');
    const chatMsg = await chatOnA;
    assert.equal(chatMsg.from, 'peer-002');
    assert.equal(chatMsg.text, 'Hello over encrypted signaling');
  } finally {
    await sigA.close();
    await sigB.close();
    globalThis.location = prevLocation;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTML, CSS, SVG icon slots, and all served ES module routes stay consistent', async () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const appJs = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  const idRefs = [...appJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(idRefs.length > 30);
  for (const id of idRefs) {
    assert.ok(html.includes(`id="${id}"`), `Missing HTML id: ${id}`);
  }

  const iconRefs = [...html.matchAll(/data-icon="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(iconRefs.length >= 10);
  for (const key of iconRefs) {
    assert.ok(Object.hasOwn(icons, key), `Missing SVG icon key: ${key}`);
  }

  const dialogRefs = [...html.matchAll(/data-close-dialog="([^"]+)"/g)].map((m) => m[1]);
  for (const id of dialogRefs) {
    assert.ok(html.includes(`id="${id}"`), `Missing dialog id: ${id}`);
  }

  const classRefs = [...appJs.matchAll(/classList\.(?:add|toggle|remove)\('([^']+)'/g)].map((m) => m[1]);
  for (const cls of classRefs) {
    assert.ok(css.includes(`.${cls}`), `Missing CSS rule for class: ${cls}`);
  }

  const server = createOpenLineServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    const routes = [
      '/',
      '/styles.css',
      '/src/app.js',
      '/src/config.js',
      '/src/crypto.js',
      '/src/mqtt-ws.js',
      '/src/signaling.js',
      '/src/media.js',
      '/src/rtc.js',
      '/src/ui-icons.js',
      '/health',
    ];
    for (const route of routes) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`);
      assert.equal(res.status, 200, `Expected 200 for ${route}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
