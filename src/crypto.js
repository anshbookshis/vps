const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes) {
  if (typeof Buffer !== 'undefined' && typeof globalThis.btoa !== 'function') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64) {
  if (typeof Buffer !== 'undefined' && typeof globalThis.atob !== 'function') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getSubtle() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto SubtleCrypto is unavailable in this environment.');
  }
  return subtle;
}

/**
 * Derive a room-scoped SHA-256 hex digest so public relay topic names
 * do not expose raw user-entered room codes.
 */
export async function deriveRoomTopicHash(roomId, passphrase = '') {
  const subtle = getSubtle();
  const digest = await subtle.digest(
    'SHA-256',
    encoder.encode(`openline:topic:v1:${roomId}:${passphrase ? 'locked' : 'open'}`)
  );
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive an AES-256-GCM CryptoKey from a user passphrase and room code.
 */
export async function deriveRoomKey(passphrase, roomId) {
  if (!passphrase) return null;
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(`openline-e2e-v1:${roomId}`),
      iterations: 60000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt an arbitrary JSON-serializable signaling payload using AES-256-GCM.
 */
export async function encryptPayload(payload, key) {
  if (!key) return payload;
  const subtle = getSubtle();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );
  return {
    __e2e: 1,
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
  };
}

/**
 * Decrypt an AES-256-GCM envelope. Throws if passphrase does not match.
 */
export async function decryptPayload(envelope, key) {
  if (!envelope || typeof envelope !== 'object') return envelope;
  if (!envelope.__e2e) {
    if (key) {
      throw new Error('Rejected unencrypted payload on locked room');
    }
    return envelope;
  }
  if (!key) {
    throw new Error('Encrypted room payload requires passphrase');
  }
  const subtle = getSubtle();
  const iv = fromBase64(envelope.iv);
  const ct = fromBase64(envelope.ct);
  const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(decoder.decode(plaintext));
}
