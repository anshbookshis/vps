# OpenLine — Free P2P Video Calling Studio

OpenLine is a zero-account, browser-to-browser WebRTC video calling web app built using only free public resources and standard browser/Node.js APIs — no paid signaling SaaS, no external build tooling, and no npm runtime dependencies.

## Free Public Resources Used

- **NAT Traversal (STUN)**: `stun:stun.cloudflare.com:3478`, `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`, `stun:stun2.l.google.com:19302`, `stun:stun.stunprotocol.org:3478`.
- **Serverless Signaling Relays**:
  - **Public MQTT over WSS** (`wss://broker.emqx.io:8084/mqtt`, `wss://broker.hivemq.com:8884/mqtt`) via a built-in zero-dependency MQTT 3.1.1 WebSocket codec (`src/mqtt-ws.js`).
  - **Public Nostr Relays** (`wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.primal.net`) via Trystero ESM CDN (`@trystero-p2p/nostr`).
  - **Local / Self-Hosted WebSocket (`/ws`)** built directly into `server.js` using Node's `node:http` & `node:crypto` (RFC 6455).
  - **Same-Browser Tabs** (`BroadcastChannel`) and **Manual SDP Copy-Paste** for offline/air-gapped peer connections.
- **Optional E2E Signaling Encryption**: WebCrypto PBKDF2 + AES-256-GCM (`src/crypto.js`) when an optional room passphrase is entered.

## Features

- **Studio Greenroom**: Live camera preview, 24-segment Web Audio input VU meter, speaker chime test, mirror toggle, device selection, and a built-in **Studio Test Slate** (`HTMLCanvasElement.captureStream`) for testing or joining without a webcam.
- **Multi-Peer Mesh (`src/rtc.js`)**: Glare-free WebRTC Perfect Negotiation, live microphone/camera switching (`replaceTrack`), screen sharing with automatic spotlight layout, Picture-in-Picture, raised hand, reactions, and direct P2P DataChannel chat & chunked file transfer.
- **Live Link Diagnostics**: Queries `RTCPeerConnection.getStats()` to display round-trip latency, candidate path (`LAN Direct`, `P2P STUN`, `TURN Relay`), resolution, FPS, and bitrate.

## Running Locally

```bash
npm start
# Open http://localhost:3000
```

## Deploying Free as a Pure Static Website

Because OpenLine supports serverless public MQTT/Nostr relays out of the box, you can deploy the static files (`index.html`, `styles.css`, `src/`) directly to **GitHub Pages**, **Cloudflare Pages**, or **Netlify** with zero backend server.

## Running Tests

```bash
npm test
```
