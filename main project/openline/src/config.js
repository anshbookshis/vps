export const APP_ID = 'openline-webrtc-studio-v1';

export const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
];

export const PUBLIC_MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

export const PUBLIC_NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

export const VIDEO_QUALITY_PRESETS = {
  balanced: { label: '720p Studio (Balanced)', width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 },
  crisp: { label: '1080p Sharp', width: 1920, height: 1080, frameRate: 30, maxBitrate: 2_800_000 },
  saver: { label: '360p Low-Bandwidth', width: 640, height: 360, frameRate: 24, maxBitrate: 450_000 },
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a human-readable room code like `K7M-92P` (avoids ambiguous 0/O, 1/I characters).
 */
export function generateRoomCode(randFn = null) {
  const bytes = new Uint8Array(6);
  if (typeof randFn === 'function') {
    for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(randFn() * 256);
  } else if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  let chars = '';
  for (let i = 0; i < 6; i += 1) {
    chars += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${chars.slice(0, 3)}-${chars.slice(3)}`;
}

export function normalizeRoomCode(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
}

export function generatePeerId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().slice(0, 12);
  }
  return `p${Math.random().toString(36).slice(2, 12)}`;
}

export function loadCustomIceServers() {
  try {
    const raw = globalThis.localStorage?.getItem('openline.customIceServers');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.urls) : [];
  } catch {
    return [];
  }
}

export function getIceConfiguration(customServers = loadCustomIceServers()) {
  return {
    iceServers: [...DEFAULT_STUN_SERVERS, ...customServers],
    iceCandidatePoolSize: 4,
  };
}
