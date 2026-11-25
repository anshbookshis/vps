import { getIceConfiguration } from './config.js';

const FILE_CHUNK_SIZE = 32 * 1024;
const MAX_BUFFERED_AMOUNT = 512 * 1024;

/**
 * Determine Perfect Negotiation politeness deterministically between two peer IDs.
 */
export function isPolitePeer(selfId, remoteId) {
  return String(selfId) < String(remoteId);
}

/**
 * Multi-peer WebRTC Mesh coordinator with Perfect Negotiation,
 * seamless track replacement, chunked binary DataChannel file sharing, and live RTP stats.
 */
export class MeshRtcManager extends EventTarget {
  constructor({ selfId, signaling, localStream = null, maxBitrate = 1_500_000 }) {
    super();
    this.selfId = selfId;
    this.signaling = signaling;
    this.localStream = localStream;
    this.maxBitrate = maxBitrate;

    /** @type {Map<string, {
     *   peerId: string,
     *   name: string,
     *   pc: RTCPeerConnection,
     *   dc: RTCDataChannel | null,
     *   makingOffer: boolean,
     *   ignoreOffer: boolean,
     *   isSettingRemoteAnswerPending: boolean,
     *   polite: boolean,
     *   pendingIce: RTCIceCandidateInit[],
     *   remoteStream: MediaStream,
     *   audioSender: RTCRtpSender | null,
     *   videoSender: RTCRtpSender | null,
     *   prevStats: Map<string, any>,
     *   incomingFiles: Map<string, any>
     * }>} */
    this.peers = new Map();
    this.statsTimer = null;
    this.closed = false;

    this.bindSignaling();
    this.statsTimer = setInterval(() => this.collectStats(), 2000);
  }

  emitEvent(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  bindSignaling() {
    this.onPeerJoined = ({ detail }) => {
      this.ensurePeer(detail.peerId, detail.name);
    };
    this.onPeerLeft = ({ detail }) => {
      this.removePeer(detail.peerId);
    };
    this.onSignal = ({ detail }) => {
      this.handleSignal(detail.from, detail.data).catch((err) => {
        this.emitEvent('rtc-error', { peerId: detail.from, message: err.message });
      });
    };

    this.signaling.addEventListener('peer-joined', this.onPeerJoined);
    this.signaling.addEventListener('peer-left', this.onPeerLeft);
    this.signaling.addEventListener('signal', this.onSignal);
  }

  ensurePeer(peerId, name = 'Guest', { autoNegotiate = true } = {}) {
    if (this.closed || peerId === this.selfId) return null;
    if (this.peers.has(peerId)) {
      const existing = this.peers.get(peerId);
      if (name && name !== existing.name) existing.name = name;
      return existing;
    }

    const pc = new RTCPeerConnection(getIceConfiguration());
    const polite = isPolitePeer(this.selfId, peerId);
    const remoteStream = new MediaStream();

    // Pre-allocate transceivers so peers without local tracks can still receive audio/video cleanly
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

    const audioTrack = this.localStream?.getAudioTracks()[0] || null;
    const videoTrack = this.localStream?.getVideoTracks()[0] || null;

    if (audioTrack) audioTransceiver.sender.replaceTrack(audioTrack).catch(() => {});
    if (videoTrack) videoTransceiver.sender.replaceTrack(videoTrack).catch(() => {});

    const peer = {
      peerId,
      name,
      pc,
      dc: null,
      autoNegotiate,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      polite,
      pendingIce: [],
      remoteStream,
      audioSender: audioTransceiver.sender,
      videoSender: videoTransceiver.sender,
      prevStats: new Map(),
      incomingFiles: new Map(),
    };

    this.peers.set(peerId, peer);

    // Impolite peer (or manual offerer) creates the control/chat/file DataChannel deterministically
    if (!polite || !autoNegotiate) {
      const dc = pc.createDataChannel('openline-data', { ordered: true });
      this.attachDataChannel(peer, dc);
    }

    pc.ondatachannel = (event) => {
      this.attachDataChannel(peer, event.channel);
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      const addedTracks = [];
      if (stream) {
        stream.getTracks().forEach((track) => {
          if (!peer.remoteStream.getTracks().some((t) => t.id === track.id)) {
            peer.remoteStream.addTrack(track);
            addedTracks.push(track);
          }
        });
      } else if (event.track) {
        if (!peer.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          peer.remoteStream.addTrack(event.track);
          addedTracks.push(event.track);
        }
      }
      addedTracks.forEach((track) => {
        track.addEventListener('mute', () => {
          this.emitEvent('remote-stream', { peerId, name: peer.name, stream: peer.remoteStream });
        });
        track.addEventListener('unmute', () => {
          this.emitEvent('remote-stream', { peerId, name: peer.name, stream: peer.remoteStream });
        });
      });
      this.emitEvent('remote-stream', { peerId, name: peer.name, stream: peer.remoteStream });
    };

    pc.onnegotiationneeded = async () => {
      if (!peer.autoNegotiate) return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        await this.signaling.sendSignal(peerId, { description: pc.localDescription });
      } catch (err) {
        this.emitEvent('rtc-error', { peerId, message: err.message });
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.signaling.sendSignal(peerId, { candidate }).catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      this.emitEvent('connection-state', {
        peerId,
        state: pc.connectionState,
        iceState: pc.iceConnectionState,
      });
      if (pc.connectionState === 'connected') {
        this.applyBitrateCap(peer).catch(() => {});
      }
      if (pc.connectionState === 'failed') {
        pc.restartIce?.();
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.emitEvent('connection-state', {
        peerId,
        state: pc.connectionState,
        iceState: pc.iceConnectionState,
      });
    };

    this.emitEvent('peer-added', { peerId, name, stream: remoteStream });
    return peer;
  }

  attachDataChannel(peer, dc) {
    peer.dc = dc;
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      this.emitEvent('datachannel-open', { peerId: peer.peerId });
    };

    dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          this.handleDataControlMessage(peer, msg);
        } catch {
          // ignore malformed control JSON
        }
      } else if (event.data instanceof ArrayBuffer) {
        this.handleIncomingFileChunk(peer, event.data);
      }
    };
  }

  handleDataControlMessage(peer, msg) {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'chat') {
      this.emitEvent('p2p-chat', {
        from: peer.peerId,
        name: msg.name || peer.name,
        text: msg.text,
        ts: msg.ts || Date.now(),
      });
    } else if (msg.type === 'reaction') {
      this.emitEvent('reaction', {
        from: peer.peerId,
        name: peer.name,
        emoji: msg.emoji,
        label: msg.label,
      });
    } else if (msg.type === 'state') {
      this.emitEvent('peer-media-state', {
        from: peer.peerId,
        state: msg.state,
      });
    } else if (msg.type === 'file-meta') {
      peer.incomingFiles.set(msg.fileId, {
        fileId: msg.fileId,
        name: msg.name,
        mime: msg.mime || 'application/octet-stream',
        size: msg.size,
        received: 0,
        chunks: [],
      });
    } else if (msg.type === 'file-end') {
      const file = peer.incomingFiles.get(msg.fileId);
      if (!file) return;
      peer.incomingFiles.delete(msg.fileId);
      const blob = new Blob(file.chunks, { type: file.mime });
      this.emitEvent('file-received', {
        from: peer.peerId,
        senderName: peer.name,
        name: file.name,
        size: file.size,
        mime: file.mime,
        blob,
        url: URL.createObjectURL(blob),
      });
    }
  }

  handleIncomingFileChunk(peer, arrayBuffer) {
    // 36-byte ASCII UUID prefix or current active transfer
    const view = new Uint8Array(arrayBuffer);
    if (view.length < 36) return;
    const header = new TextDecoder().decode(view.subarray(0, 36)).trim();
    const payload = view.subarray(36);
    const entry = peer.incomingFiles.get(header);
    if (!entry) return;
    entry.chunks.push(payload);
    entry.received += payload.byteLength;
    this.emitEvent('file-progress', {
      peerId: peer.peerId,
      name: entry.name,
      received: entry.received,
      total: entry.size,
    });
  }

  async handleSignal(fromId, data) {
    if (!data || this.closed) return;
    const peer = this.ensurePeer(fromId);
    if (!peer) return;
    const { pc } = peer;

    if (data.description) {
      const description = data.description;
      const readyForOffer =
        !peer.makingOffer &&
        (pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending);
      const offerCollision = description.type === 'offer' && !readyForOffer;

      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;

      peer.isSettingRemoteAnswerPending = description.type === 'answer';
      await pc.setRemoteDescription(description);
      peer.isSettingRemoteAnswerPending = false;

      // Flush buffered ICE candidates now that remote description exists
      while (peer.pendingIce.length > 0) {
        const queued = peer.pendingIce.shift();
        await pc.addIceCandidate(queued).catch(() => {});
      }

      if (description.type === 'offer') {
        await pc.setLocalDescription();
        await this.signaling.sendSignal(fromId, { description: pc.localDescription });
      }
      return;
    }

    if (data.candidate) {
      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(data.candidate);
        } else {
          peer.pendingIce.push(data.candidate);
        }
      } catch (err) {
        if (!peer.ignoreOffer) throw err;
      }
    }
  }

  async replaceTracks({ audioTrack = undefined, videoTrack = undefined } = {}) {
    const tasks = [];
    for (const peer of this.peers.values()) {
      if (audioTrack !== undefined && peer.audioSender) {
        tasks.push(peer.audioSender.replaceTrack(audioTrack).catch(() => {}));
      }
      if (videoTrack !== undefined && peer.videoSender) {
        tasks.push(
          peer.videoSender.replaceTrack(videoTrack).then(() => this.applyBitrateCap(peer)).catch(() => {})
        );
      }
    }
    await Promise.all(tasks);
  }

  async setMaxBitrate(maxBitrate) {
    this.maxBitrate = maxBitrate;
    await Promise.all(Array.from(this.peers.values()).map((peer) => this.applyBitrateCap(peer)));
  }

  async applyBitrateCap(peer) {
    if (!peer.videoSender?.getParameters) return;
    try {
      const params = peer.videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = this.maxBitrate;
      await peer.videoSender.setParameters(params);
    } catch {
      // Not all browsers allow setParameters before track binding
    }
  }

  broadcastData(payload) {
    const json = JSON.stringify(payload);
    let sentCount = 0;
    for (const peer of this.peers.values()) {
      if (peer.dc?.readyState === 'open') {
        peer.dc.send(json);
        sentCount += 1;
      }
    }
    return sentCount;
  }

  async sendFile(file, onProgress) {
    const openPeers = Array.from(this.peers.values()).filter((p) => p.dc?.readyState === 'open');
    if (openPeers.length === 0) {
      throw new Error('Wait for at least one peer DataChannel connection before sending files.');
    }

    const fileId = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).slice(0, 36).padEnd(36, ' ');
    const headerBytes = new TextEncoder().encode(fileId);
    const meta = JSON.stringify({
      type: 'file-meta',
      fileId,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
    });
    openPeers.forEach((p) => p.dc.send(meta));

    let offset = 0;
    while (offset < file.size) {
      const slice = file.slice(offset, offset + FILE_CHUNK_SIZE);
      const buf = new Uint8Array(await slice.arrayBuffer());
      const frame = new Uint8Array(headerBytes.length + buf.length);
      frame.set(headerBytes, 0);
      frame.set(buf, headerBytes.length);

      for (const peer of openPeers) {
        if (peer.dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await new Promise((resolve) => {
            peer.dc.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT / 2;
            const onLow = () => {
              peer.dc.removeEventListener('bufferedamountlow', onLow);
              resolve();
            };
            peer.dc.addEventListener('bufferedamountlow', onLow);
            setTimeout(resolve, 250);
          });
        }
        peer.dc.send(frame);
      }

      offset += buf.byteLength;
      onProgress?.(offset, file.size);
    }

    const endMsg = JSON.stringify({ type: 'file-end', fileId });
    openPeers.forEach((p) => p.dc.send(endMsg));
  }

  async collectStats() {
    if (this.closed || this.peers.size === 0) {
      this.emitEvent('stats-update', { peers: [], summary: null });
      return;
    }

    const reports = [];
    for (const peer of this.peers.values()) {
      try {
        const stats = await peer.pc.getStats();
        let rttMs = null;
        let candidateType = 'unknown';
        let outKbps = 0;
        let inKbps = 0;
        let resolution = null;
        let fps = null;
        let packetsLost = 0;
        let codec = null;

        let activePairId = null;
        stats.forEach((report) => {
          if (report.type === 'transport' && report.selectedCandidatePairId) {
            activePairId = report.selectedCandidatePairId;
          }
        });

        stats.forEach((report) => {
          if (
            report.type === 'candidate-pair' &&
            (report.id === activePairId || (report.nominated && report.state === 'succeeded'))
          ) {
            if (typeof report.currentRoundTripTime === 'number') {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
            const localCand = stats.get(report.localCandidateId);
            if (localCand?.candidateType) {
              candidateType = localCand.candidateType;
            }
          }

          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            const prev = peer.prevStats.get(report.id);
            if (prev && report.timestamp > prev.timestamp) {
              const dt = (report.timestamp - prev.timestamp) / 1000;
              outKbps = Math.round(((report.bytesSent - prev.bytesSent) * 8) / (dt * 1000));
            }
            peer.prevStats.set(report.id, { bytesSent: report.bytesSent, timestamp: report.timestamp });
            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}x${report.frameHeight}`;
            }
            if (report.framesPerSecond) fps = Math.round(report.framesPerSecond);
            const codecReport = stats.get(report.codecId);
            if (codecReport?.mimeType) codec = codecReport.mimeType.split('/')[1];
          }

          if (report.type === 'inbound-rtp' && (report.kind === 'video' || report.kind === 'audio')) {
            const prev = peer.prevStats.get(report.id);
            if (prev && report.timestamp > prev.timestamp) {
              const dt = (report.timestamp - prev.timestamp) / 1000;
              inKbps += Math.round(((report.bytesReceived - prev.bytesReceived) * 8) / (dt * 1000));
            }
            peer.prevStats.set(report.id, { bytesReceived: report.bytesReceived, timestamp: report.timestamp });
            if (typeof report.packetsLost === 'number') packetsLost += report.packetsLost;
          }
        });

        reports.push({
          peerId: peer.peerId,
          name: peer.name,
          state: peer.pc.connectionState,
          iceState: peer.pc.iceConnectionState,
          rttMs,
          candidateType,
          outKbps: Math.max(0, outKbps),
          inKbps: Math.max(0, inKbps),
          resolution,
          fps,
          packetsLost,
          codec,
        });
      } catch {
        // ignore closed PCs
      }
    }

    const rtts = reports.map((r) => r.rttMs).filter((v) => v !== null);
    const avgRtt = rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null;
    const totalKbps = reports.reduce((sum, r) => sum + r.outKbps + r.inKbps, 0);
    const pathTypes = new Set(reports.map((r) => r.candidateType));
    const linkKind = pathTypes.has('relay')
      ? 'TURN Relay'
      : pathTypes.has('srflx') || pathTypes.has('prflx')
      ? 'P2P STUN'
      : pathTypes.has('host')
      ? 'LAN Direct'
      : 'Negotiating';

    this.emitEvent('stats-update', {
      peers: reports,
      summary: { avgRtt, totalKbps, linkKind, peerCount: reports.length },
    });
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    this.peers.delete(peerId);
    try {
      peer.dc?.close();
      peer.pc.close();
    } catch {
      // ignore
    }
    this.emitEvent('peer-removed', { peerId });
  }

  close() {
    this.closed = true;
    clearInterval(this.statsTimer);
    this.signaling.removeEventListener('peer-joined', this.onPeerJoined);
    this.signaling.removeEventListener('peer-left', this.onPeerLeft);
    this.signaling.removeEventListener('signal', this.onSignal);
    for (const peerId of Array.from(this.peers.keys())) {
      this.removePeer(peerId);
    }
  }
}
