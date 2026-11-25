import {
  generatePeerId,
  generateRoomCode,
  loadCustomIceServers,
  normalizeRoomCode,
  VIDEO_QUALITY_PRESETS,
} from './config.js';
import {
  acquireLocalMedia,
  AudioLevelMonitor,
  createStudioTestStream,
  listMediaDevices,
  playStudioChime,
} from './media.js';
import { MeshRtcManager } from './rtc.js';
import { RoomSignaling } from './signaling.js';
import { icons } from './ui-icons.js';

const MAX_P2P_FILE_BYTES = 25 * 1024 * 1024;

const state = {
  inCall: false,
  peerId: generatePeerId(),
  roomId: '',
  name: localStorage.getItem('openline.name') || '',
  passphrase: '',
  transportMode: 'auto',

  micEnabled: true,
  camEnabled: true,
  mirrored: true,
  testCardActive: false,
  screenSharing: false,
  handRaised: false,
  quality: 'balanced',
  echoCancellation: true,
  noiseSuppression: true,

  localStream: null,
  testCardHandle: null,
  screenStream: null,
  vuMonitor: null,

  signaling: null,
  rtc: null,
  callStartedAt: 0,
  timerInterval: null,
  unreadChat: 0,
  dockTab: 'chat',
  dockOpen: false,
  pinnedPeerId: null,
  speakingPeers: new Set(),
  remoteMonitors: new Map(),
  peerStates: new Map(),
  manualPeerId: 'manual-peer',
};

const els = {
  viewGreenroom: document.getElementById('view-greenroom'),
  viewCall: document.getElementById('view-call'),

  previewVideo: document.getElementById('preview-video'),
  previewFallback: document.getElementById('preview-fallback'),
  previewAvatar: document.getElementById('preview-avatar'),
  previewFallbackLabel: document.getElementById('preview-fallback-label'),
  previewResBadge: document.getElementById('preview-res-badge'),
  btnPreviewMirror: document.getElementById('btn-preview-mirror'),
  btnPreviewTestcard: document.getElementById('btn-preview-testcard'),
  btnPreviewMic: document.getElementById('btn-preview-mic'),
  btnPreviewCam: document.getElementById('btn-preview-cam'),
  btnTestChime: document.getElementById('btn-test-chime'),
  vuMeter: document.getElementById('vu-meter'),
  vuStatusText: document.getElementById('vu-status-text'),
  mediaWarning: document.getElementById('media-warning'),

  selectAudioIn: document.getElementById('select-audio-in'),
  selectVideoIn: document.getElementById('select-video-in'),
  selectQuality: document.getElementById('select-quality'),

  joinForm: document.getElementById('join-form'),
  inputName: document.getElementById('input-name'),
  inputRoom: document.getElementById('input-room'),
  inputPassphrase: document.getElementById('input-passphrase'),
  selectTransport: document.getElementById('select-transport'),
  btnNewCode: document.getElementById('btn-new-code'),
  btnCopyInvite: document.getElementById('btn-copy-invite'),

  callRoomCode: document.getElementById('call-room-code'),
  btnCallCopy: document.getElementById('btn-call-copy'),
  callE2eBadge: document.getElementById('call-e2e-badge'),
  callTimer: document.getElementById('call-timer'),
  callTransportBadge: document.getElementById('call-transport-badge'),
  btnDiagnosticsPill: document.getElementById('btn-diagnostics-pill'),
  telemetryDot: document.getElementById('telemetry-dot'),
  telemetrySummary: document.getElementById('telemetry-summary'),

  toastRail: document.getElementById('toast-rail'),
  videoStage: document.getElementById('video-stage'),
  sideDock: document.getElementById('side-dock'),
  tabChat: document.getElementById('tab-chat'),
  tabPeople: document.getElementById('tab-people'),
  panelChat: document.getElementById('panel-chat'),
  panelPeople: document.getElementById('panel-people'),
  peopleCountBadge: document.getElementById('people-count-badge'),

  chatMessages: document.getElementById('chat-messages'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  fileInput: document.getElementById('file-input'),
  btnAttachFile: document.getElementById('btn-attach-file'),
  fileProgressBar: document.getElementById('file-progress-bar'),
  fileProgressLabel: document.getElementById('file-progress-label'),
  fileProgressFill: document.getElementById('file-progress-fill'),
  rosterList: document.getElementById('roster-list'),
  callSelectAudio: document.getElementById('call-select-audio'),
  callSelectVideo: document.getElementById('call-select-video'),
  callSelectQuality: document.getElementById('call-select-quality'),

  btnCallMic: document.getElementById('btn-call-mic'),
  btnCallCam: document.getElementById('btn-call-cam'),
  btnCallShare: document.getElementById('btn-call-share'),
  btnCallTestcard: document.getElementById('btn-call-testcard'),
  btnCallHand: document.getElementById('btn-call-hand'),
  btnReactionMenu: document.getElementById('btn-reaction-menu'),
  reactionTray: document.getElementById('reaction-tray'),
  btnCallChat: document.getElementById('btn-call-chat'),
  chatUnreadDot: document.getElementById('chat-unread-dot'),
  btnCallPeople: document.getElementById('btn-call-people'),
  btnCallManual: document.getElementById('btn-call-manual'),
  btnCallDiag: document.getElementById('btn-call-diag'),
  btnCallLeave: document.getElementById('btn-call-leave'),

  btnOpenSettings: document.getElementById('btn-open-settings'),
  modalSettings: document.getElementById('modal-settings'),
  chkEcho: document.getElementById('chk-echo'),
  chkNoise: document.getElementById('chk-noise'),
  inputCustomIce: document.getElementById('input-custom-ice'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnResetIce: document.getElementById('btn-reset-ice'),

  modalDiagnostics: document.getElementById('modal-diagnostics'),
  diagSummary: document.getElementById('diag-summary'),
  diagPeers: document.getElementById('diag-peers'),

  modalManualSdp: document.getElementById('modal-manual-sdp'),
  btnManualOffer: document.getElementById('btn-manual-offer'),
  btnManualCopy: document.getElementById('btn-manual-copy'),
  btnManualAccept: document.getElementById('btn-manual-accept'),
  manualLocalSdp: document.getElementById('manual-local-sdp'),
  manualRemoteSdp: document.getElementById('manual-remote-sdp'),
};

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const key = el.dataset.icon;
    if (icons[key]) el.innerHTML = icons[key];
  });
}

function showToast(text, durationMs = 2800) {
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = text;
  els.toastRail.appendChild(item);
  setTimeout(() => item.remove(), durationMs);
}

function getInitials(name) {
  const clean = String(name || 'Guest').trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase() || 'G';
}

function buildVuSegments() {
  els.vuMeter.innerHTML = '';
  for (let i = 0; i < 24; i += 1) {
    const seg = document.createElement('span');
    seg.className = 'vu-seg';
    els.vuMeter.appendChild(seg);
  }
}

function updateVuSegments(level) {
  const activeCount = Math.round(level * 24);
  const segments = els.vuMeter.children;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    seg.className = 'vu-seg';
    if (i < activeCount) {
      if (i >= 20) seg.classList.add('on-peak');
      else if (i >= 14) seg.classList.add('on-mid');
      else seg.classList.add('on-low');
    }
  }
  els.vuStatusText.textContent = state.micEnabled
    ? activeCount > 2
      ? `Signal ${Math.round(level * 100)}%`
      : 'Quiet'
    : 'Muted';
}

function syncPreviewUi() {
  const activeStream = state.testCardActive ? state.testCardHandle?.stream : state.localStream;
  els.previewVideo.srcObject = activeStream || null;
  els.previewVideo.classList.toggle('mirrored', state.mirrored && !state.testCardActive);
  els.btnPreviewMirror.classList.toggle('active', state.mirrored);
  els.btnPreviewTestcard.classList.toggle('active', state.testCardActive);

  const hasVideo = Boolean(activeStream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live'));
  els.previewFallback.classList.toggle('hidden', hasVideo);
  els.previewAvatar.textContent = getInitials(els.inputName.value || 'Guest');

  const track = activeStream?.getVideoTracks()[0];
  if (track && hasVideo) {
    const settings = track.getSettings?.() || {};
    els.previewResBadge.textContent = state.testCardActive
      ? 'TEST SLATE 720p'
      : settings.width
      ? `${settings.width}x${settings.height}`
      : 'CAM LIVE';
  } else {
    els.previewResBadge.textContent = state.localStream?.getAudioTracks().length ? 'AUDIO ONLY' : 'NO MEDIA';
  }

  els.btnPreviewMic.classList.toggle('muted', !state.micEnabled);
  els.btnPreviewMic.setAttribute('aria-pressed', String(state.micEnabled));
  els.btnPreviewMic.innerHTML = `<span class="icon-slot">${state.micEnabled ? icons.micOn : icons.micOff}</span><span>${state.micEnabled ? 'Mic On' : 'Mic Off'}</span>`;

  els.btnPreviewCam.classList.toggle('muted', !state.camEnabled && !state.testCardActive);
  els.btnPreviewCam.setAttribute('aria-pressed', String(state.camEnabled || state.testCardActive));
  els.btnPreviewCam.innerHTML = `<span class="icon-slot">${state.camEnabled || state.testCardActive ? icons.camOn : icons.camOff}</span><span>${state.camEnabled ? 'Cam On' : 'Cam Off'}</span>`;
}

async function populateDeviceSelectors() {
  const { audioInputs, videoInputs } = await listMediaDevices();
  const fillSelect = (selectEl, devices, emptyLabel) => {
    const prev = selectEl.value;
    selectEl.innerHTML = '';
    if (devices.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = emptyLabel;
      selectEl.appendChild(opt);
      return;
    }
    devices.forEach((dev, index) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = dev.label || `${emptyLabel} ${index + 1}`;
      selectEl.appendChild(opt);
    });
    if (prev && devices.some((d) => d.deviceId === prev)) {
      selectEl.value = prev;
    }
  };

  fillSelect(els.selectAudioIn, audioInputs, 'Microphone');
  fillSelect(els.selectVideoIn, videoInputs, 'Camera');
  fillSelect(els.callSelectAudio, audioInputs, 'Microphone');
  fillSelect(els.callSelectVideo, videoInputs, 'Camera');
}

async function initGreenroomMedia({ audioDeviceId = '', videoDeviceId = '' } = {}) {
  state.vuMonitor?.stop();
  state.localStream?.getTracks().forEach((t) => t.stop());

  const res = await acquireLocalMedia({
    audioDeviceId,
    videoDeviceId,
    quality: state.quality,
    wantAudio: true,
    wantVideo: true,
    echoCancellation: state.echoCancellation,
    noiseSuppression: state.noiseSuppression,
  });

  state.localStream = res.stream;
  if (res.warning) {
    els.mediaWarning.textContent = res.warning;
    els.mediaWarning.classList.remove('hidden');
  } else {
    els.mediaWarning.classList.add('hidden');
  }

  state.micEnabled = res.hasAudio;
  state.camEnabled = res.hasVideo;

  if (state.localStream) {
    state.vuMonitor = new AudioLevelMonitor(state.localStream, (level) => {
      if (!state.inCall) updateVuSegments(state.micEnabled ? level : 0);
    });
  } else {
    updateVuSegments(0);
  }

  await populateDeviceSelectors();
  syncPreviewUi();
}

function getEffectiveLocalStream() {
  if (state.screenSharing && state.screenStream) {
    const combined = new MediaStream();
    const audioTrack = state.localStream?.getAudioTracks()[0];
    if (audioTrack) combined.addTrack(audioTrack);
    state.screenStream.getVideoTracks().forEach((t) => combined.addTrack(t));
    return combined;
  }
  if (state.testCardActive && state.testCardHandle?.stream) {
    const combined = new MediaStream();
    const audioTrack =
      state.localStream?.getAudioTracks()[0] || state.testCardHandle.stream.getAudioTracks()[0];
    if (audioTrack) combined.addTrack(audioTrack);
    state.testCardHandle.stream.getVideoTracks().forEach((t) => combined.addTrack(t));
    return combined;
  }
  return state.localStream;
}

function toggleTestCard() {
  state.testCardActive = !state.testCardActive;
  if (state.testCardActive && !state.testCardHandle) {
    state.testCardHandle = createStudioTestStream({
      label: els.inputName.value.trim() || 'OpenLine Desk',
      withAudio: !state.localStream?.getAudioTracks().length,
    });
  } else if (!state.testCardActive && state.testCardHandle) {
    state.testCardHandle.stop();
    state.testCardHandle = null;
  }

  if (state.inCall && state.rtc) {
    const stream = getEffectiveLocalStream();
    state.rtc.replaceTracks({
      audioTrack: stream?.getAudioTracks()[0] || null,
      videoTrack: stream?.getVideoTracks()[0] || null,
    });
    renderStage();
  } else {
    syncPreviewUi();
  }
  syncCallControlButtons();
}

function toggleMic() {
  const audioTracks = state.localStream?.getAudioTracks() || [];
  if (audioTracks.length === 0) {
    showToast('No microphone stream available.');
    return;
  }
  state.micEnabled = !state.micEnabled;
  audioTracks.forEach((t) => {
    t.enabled = state.micEnabled;
  });
  state.vuMonitor?.resume();
  broadcastLocalMediaState();
  syncPreviewUi();
  syncCallControlButtons();
  if (state.inCall) renderStage();
}

function toggleCam() {
  const videoTracks = state.localStream?.getVideoTracks() || [];
  if (videoTracks.length === 0) {
    // Offer test card cleanly if user has no hardware camera
    toggleTestCard();
    return;
  }
  state.camEnabled = !state.camEnabled;
  videoTracks.forEach((t) => {
    t.enabled = state.camEnabled;
  });
  broadcastLocalMediaState();
  syncPreviewUi();
  syncCallControlButtons();
  if (state.inCall) renderStage();
}

async function toggleScreenShare() {
  if (!state.inCall) return;
  if (state.screenSharing) {
    state.screenStream?.getTracks().forEach((t) => t.stop());
    state.screenStream = null;
    state.screenSharing = false;
    const baseStream = getEffectiveLocalStream();
    await state.rtc?.replaceTracks({ videoTrack: baseStream?.getVideoTracks()[0] || null });
    broadcastLocalMediaState();
    syncCallControlButtons();
    renderStage();
    return;
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast('Screen sharing is not supported in this browser.');
    return;
  }

  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: false,
    });
    state.screenStream = screenStream;
    state.screenSharing = true;
    const screenTrack = screenStream.getVideoTracks()[0];
    screenTrack.onended = () => {
      if (state.screenSharing) toggleScreenShare();
    };
    await state.rtc?.replaceTracks({ videoTrack: screenTrack });
    broadcastLocalMediaState();
    syncCallControlButtons();
    renderStage();
  } catch {
    showToast('Screen share cancelled.');
  }
}

function broadcastLocalMediaState() {
  const payload = {
    mic: state.micEnabled,
    cam: state.camEnabled || state.testCardActive || state.screenSharing,
    screen: state.screenSharing,
    hand: state.handRaised,
  };
  state.rtc?.broadcastData({ type: 'state', state: payload });
  state.signaling?.sendState(payload).catch(() => {});
}

function syncCallControlButtons() {
  els.btnCallMic.classList.toggle('is-muted', !state.micEnabled);
  els.btnCallMic.innerHTML = `<span class="icon-slot">${state.micEnabled ? icons.micOn : icons.micOff}</span><span class="deck-label">${state.micEnabled ? 'Mic' : 'Muted'} <kbd>M</kbd></span>`;

  const camLive = state.camEnabled || state.testCardActive;
  els.btnCallCam.classList.toggle('is-muted', !camLive);
  els.btnCallCam.innerHTML = `<span class="icon-slot">${camLive ? icons.camOn : icons.camOff}</span><span class="deck-label">${camLive ? 'Cam' : 'Cam Off'} <kbd>V</kbd></span>`;

  els.btnCallShare.classList.toggle('is-on', state.screenSharing);
  els.btnCallTestcard.classList.toggle('is-on', state.testCardActive);
  els.btnCallHand.classList.toggle('is-on', state.handRaised);
  els.btnCallChat.classList.toggle('is-on', state.dockOpen && state.dockTab === 'chat');
  els.btnCallPeople.classList.toggle('is-on', state.dockOpen && state.dockTab === 'people');
}

function hasVisibleVideoTrack(stream, isLocal, isCamOff) {
  if (isCamOff || !stream) return false;
  return stream
    .getVideoTracks()
    .some((t) => t.enabled && t.readyState === 'live' && (isLocal || !t.muted));
}

function updateVideoTile(tile, descriptor) {
  const { id, name, stream, isLocal, isMutedAudio, isCamOff, isScreen, handRaised } = descriptor;
  const isPinned = state.pinnedPeerId === id || (isScreen && !state.pinnedPeerId);

  tile.classList.toggle('is-spotlight', isPinned);
  tile.classList.toggle('is-screenshare', isScreen);
  tile.classList.toggle('is-speaking', state.speakingPeers.has(id));

  const video = tile.querySelector('video');
  if (video) {
    video.muted = isLocal;
    video.classList.toggle('mirrored', isLocal && state.mirrored && !state.testCardActive && !state.screenSharing);
    if (video.srcObject !== stream) {
      video.srcObject = stream || null;
    }
    if (stream && video.paused) {
      video.play().catch(() => {});
    }
  }

  const hasLiveVideo = hasVisibleVideoTrack(stream, isLocal, isCamOff);
  let fallback = tile.querySelector('.tile-avatar-layer');
  if (!hasLiveVideo) {
    if (!fallback) {
      fallback = document.createElement('div');
      fallback.className = 'tile-avatar-layer';
      const disc = document.createElement('div');
      disc.className = 'avatar-disc';
      fallback.appendChild(disc);
      tile.insertBefore(fallback, tile.querySelector('.tile-overlay-top'));
    }
    fallback.querySelector('.avatar-disc').textContent = getInitials(name);
  } else if (fallback) {
    fallback.remove();
  }

  const topBar = tile.querySelector('.tile-overlay-top');
  let handBadge = topBar.querySelector('.tile-hand-badge');
  if (handRaised && !handBadge) {
    handBadge = document.createElement('span');
    handBadge.className = 'tile-hand-badge';
    handBadge.innerHTML = `${icons.hand} Hand Raised`;
    topBar.prepend(handBadge);
  } else if (!handRaised && handBadge) {
    handBadge.remove();
  }

  const actions = topBar.querySelector('.tile-actions');
  actions.classList.toggle('pinned', state.pinnedPeerId === id);
  const pinBtn = actions.querySelector('[data-pin-btn]');
  if (pinBtn) {
    pinBtn.classList.toggle('active', state.pinnedPeerId === id);
    pinBtn.title = state.pinnedPeerId === id ? 'Unpin spotlight' : 'Pin spotlight';
  }

  tile.querySelector('.tile-nameplate').textContent = isLocal ? `${name} (You)` : name;
  tile.querySelector('.tile-state-tag').textContent = isScreen ? 'SCREEN' : isMutedAudio ? 'MUTED' : 'LIVE';
}

function buildVideoTile(descriptor) {
  const { id, isLocal } = descriptor;
  const tile = document.createElement('article');
  tile.className = 'video-tile';
  tile.dataset.peerTile = id;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  tile.appendChild(video);

  const topBar = document.createElement('div');
  topBar.className = 'tile-overlay-top';

  const actions = document.createElement('div');
  actions.className = 'tile-actions';

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.dataset.pinBtn = '1';
  pinBtn.className = 'tile-action-btn';
  pinBtn.innerHTML = icons.pin;
  pinBtn.addEventListener('click', () => {
    state.pinnedPeerId = state.pinnedPeerId === id ? null : id;
    renderStage();
  });
  actions.appendChild(pinBtn);

  if (!isLocal && document.pictureInPictureEnabled) {
    const pipBtn = document.createElement('button');
    pipBtn.type = 'button';
    pipBtn.className = 'tile-action-btn';
    pipBtn.title = 'Picture-in-Picture';
    pipBtn.innerHTML = icons.pip;
    pipBtn.addEventListener('click', () => {
      if (document.pictureInPictureElement === video) {
        document.exitPictureInPicture().catch(() => {});
      } else {
        video.requestPictureInPicture?.().catch(() => {});
      }
    });
    actions.appendChild(pipBtn);
  }

  topBar.appendChild(actions);
  tile.appendChild(topBar);

  const footer = document.createElement('div');
  footer.className = 'tile-footer';

  const nameplate = document.createElement('span');
  nameplate.className = 'tile-nameplate';
  footer.appendChild(nameplate);

  const tag = document.createElement('span');
  tag.className = 'tile-state-tag';
  footer.appendChild(tag);

  tile.appendChild(footer);
  updateVideoTile(tile, descriptor);
  return tile;
}

function renderStage() {
  if (!state.inCall) return;
  const descriptors = [];

  const localStream = getEffectiveLocalStream();
  descriptors.push({
    id: 'local',
    name: state.name,
    stream: localStream,
    isLocal: true,
    isMutedAudio: !state.micEnabled,
    isCamOff: !state.camEnabled && !state.testCardActive && !state.screenSharing,
    isScreen: state.screenSharing,
    handRaised: state.handRaised,
  });

  let anySpotlight = Boolean(state.pinnedPeerId || state.screenSharing);

  if (state.rtc) {
    for (const peer of state.rtc.peers.values()) {
      const pState = state.peerStates.get(peer.peerId) || {};
      if (pState.screen) anySpotlight = true;
      descriptors.push({
        id: peer.peerId,
        name: peer.name,
        stream: peer.remoteStream,
        isLocal: false,
        isMutedAudio: pState.mic === false,
        isCamOff: pState.cam === false,
        isScreen: Boolean(pState.screen),
        handRaised: Boolean(pState.hand),
      });
    }
  }

  els.videoStage.className = 'video-stage';
  if (anySpotlight && descriptors.length > 1) {
    els.videoStage.classList.add('spotlight-mode');
  } else if (descriptors.length === 1) {
    els.videoStage.classList.add('grid-1');
  } else if (descriptors.length === 2) {
    els.videoStage.classList.add('grid-2');
  } else if (descriptors.length <= 4) {
    els.videoStage.classList.add('grid-3-4');
  } else {
    els.videoStage.classList.add('grid-5-plus');
  }

  const activeIds = new Set(descriptors.map((d) => d.id));
  Array.from(els.videoStage.children).forEach((el) => {
    if (!activeIds.has(el.dataset.peerTile)) {
      el.remove();
    }
  });

  descriptors.forEach((desc) => {
    const existing = els.videoStage.querySelector(`[data-peer-tile="${desc.id}"]`);
    if (existing) {
      updateVideoTile(existing, desc);
    } else {
      els.videoStage.appendChild(buildVideoTile(desc));
    }
  });

  renderRoster();
}

function renderRoster() {
  const count = 1 + (state.rtc?.peers.size || 0);
  els.peopleCountBadge.textContent = String(count);
  els.rosterList.innerHTML = '';

  const addItem = (label, statusText, dotClass) => {
    const li = document.createElement('li');
    li.className = 'roster-item';
    li.innerHTML = `<span></span><span class="mono" style="font-size:0.74rem;color:var(--ink-muted)"><span class="status-dot ${dotClass}" style="margin-right:6px"></span>${statusText}</span>`;
    li.firstChild.textContent = label;
    els.rosterList.appendChild(li);
  };

  addItem(`${state.name} (You)`, state.micEnabled ? 'Mic On' : 'Muted', 'green');
  if (state.rtc) {
    for (const peer of state.rtc.peers.values()) {
      const conn = peer.pc.connectionState || 'new';
      const dot = conn === 'connected' ? 'green' : conn === 'failed' ? 'red' : 'amber';
      addItem(peer.name, conn, dot);
    }
  }
}

function appendChatMessage({ author, text, ts, self = false, fileUrl = null, fileName = null, fileSize = null }) {
  const empty = els.chatMessages.querySelector('.chat-empty');
  if (empty) empty.remove();

  const card = document.createElement('div');
  card.className = `chat-msg${self ? ' self' : ''}`;

  const meta = document.createElement('div');
  meta.className = 'chat-meta';
  const who = document.createElement('span');
  who.className = 'chat-author';
  who.textContent = author;
  const time = document.createElement('span');
  time.className = 'mono';
  time.textContent = new Date(ts || Date.now()).toTimeString().slice(0, 5);
  meta.append(who, time);
  card.appendChild(meta);

  if (text) {
    const body = document.createElement('div');
    body.className = 'chat-body';
    body.textContent = text;
    card.appendChild(body);
  }

  if (fileUrl && fileName) {
    const fileBox = document.createElement('div');
    fileBox.className = 'file-card';
    const info = document.createElement('span');
    info.className = 'mono';
    info.style.fontSize = '0.75rem';
    info.textContent = `${fileName} (${Math.max(1, Math.round((fileSize || 0) / 1024))} KB)`;
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    link.textContent = 'Download';
    fileBox.append(info, link);
    card.appendChild(fileBox);
  }

  els.chatMessages.appendChild(card);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;

  if (!self && (!state.dockOpen || state.dockTab !== 'chat')) {
    state.unreadChat += 1;
    els.chatUnreadDot.classList.remove('hidden');
  }
}

function openDock(tab) {
  if (state.dockOpen && state.dockTab === tab) {
    state.dockOpen = false;
  } else {
    state.dockOpen = true;
    state.dockTab = tab;
  }

  els.sideDock.classList.toggle('hidden', !state.dockOpen);
  els.tabChat.classList.toggle('active', state.dockTab === 'chat');
  els.tabPeople.classList.toggle('active', state.dockTab === 'people');
  els.panelChat.classList.toggle('hidden', state.dockTab !== 'chat');
  els.panelPeople.classList.toggle('hidden', state.dockTab !== 'people');

  if (state.dockOpen && state.dockTab === 'chat') {
    state.unreadChat = 0;
    els.chatUnreadDot.classList.add('hidden');
  }
  syncCallControlButtons();
}

function updateDiagnosticsModal(peers, summary) {
  if (!summary || peers.length === 0) {
    els.telemetryDot.className = 'status-dot';
    els.telemetrySummary.textContent = 'Solo in studio';
    els.diagSummary.textContent = 'No remote peers connected yet.';
    els.diagPeers.innerHTML = '';
    return;
  }

  const allConnected = peers.every((p) => p.state === 'connected');
  els.telemetryDot.className = `status-dot ${allConnected ? 'green' : 'amber'}`;
  const rttLabel = summary.avgRtt !== null ? `${summary.avgRtt} ms` : '-- ms';
  const rateLabel = summary.totalKbps > 1000
    ? `${(summary.totalKbps / 1000).toFixed(1)} Mbps`
    : `${summary.totalKbps} kbps`;
  els.telemetrySummary.textContent = `${summary.linkKind} · ${rttLabel} · ${rateLabel}`;

  els.diagSummary.textContent = `Transport: ${state.signaling?.getTransportSummary()} | ICE Path: ${summary.linkKind} | Mean RTT: ${rttLabel}`;
  els.diagPeers.innerHTML = '';

  peers.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'diag-card mono';
    const fields = [
      ['Peer', p.name],
      ['State', `${p.state} (${p.iceState})`],
      ['Path', p.candidateType],
      ['RTT', p.rttMs !== null ? `${p.rttMs} ms` : '--'],
      ['Video', p.resolution ? `${p.resolution} @ ${p.fps || '?'}fps` : 'Audio / Idle'],
      ['Bitrate', `↑${p.outKbps} / ↓${p.inKbps} kbps`],
    ];
    fields.forEach(([k, v]) => {
      const box = document.createElement('div');
      box.innerHTML = `<div style="color:var(--ink-muted);font-size:0.7rem">${k}</div><div></div>`;
      box.lastChild.textContent = v;
      card.appendChild(box);
    });
    els.diagPeers.appendChild(card);
  });
}

function startCallTimer() {
  state.callStartedAt = Date.now();
  clearInterval(state.timerInterval);
  const update = () => {
    const secs = Math.floor((Date.now() - state.callStartedAt) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    els.callTimer.textContent = `${mm}:${ss}`;
  };
  update();
  state.timerInterval = setInterval(update, 1000);
}

async function enterStudioCall(event) {
  event.preventDefault();
  const name = els.inputName.value.trim() || 'Guest';
  const roomId = normalizeRoomCode(els.inputRoom.value) || generateRoomCode();
  const passphrase = els.inputPassphrase.value;
  const mode = els.selectTransport.value;

  state.name = name;
  state.roomId = roomId;
  state.passphrase = passphrase;
  state.transportMode = mode;
  localStorage.setItem('openline.name', name);
  window.location.hash = `room=${encodeURIComponent(roomId)}`;

  els.viewGreenroom.classList.add('hidden');
  els.viewCall.classList.remove('hidden');
  state.inCall = true;

  els.callRoomCode.textContent = roomId;
  els.callE2eBadge.classList.toggle('hidden', !passphrase);
  els.btnCallManual.classList.toggle('hidden', mode !== 'manual');
  els.callSelectQuality.value = state.quality;
  els.chatMessages.innerHTML = '<p class="chat-empty">Direct peer-to-peer room chat &amp; file drop ready.</p>';

  startCallTimer();
  playStudioChime(587.33, 120);

  state.signaling = new RoomSignaling({
    roomId,
    peerId: state.peerId,
    name,
    passphrase,
    mode,
  });

  state.signaling.addEventListener('transport-change', ({ detail }) => {
    els.callTransportBadge.textContent = detail.summary;
  });

  state.signaling.addEventListener('chat', ({ detail }) => {
    appendChatMessage({ author: detail.name, text: detail.text, ts: detail.ts });
  });

  state.signaling.addEventListener('peer-state', ({ detail }) => {
    state.peerStates.set(detail.from, detail.state);
    renderStage();
  });

  const preset = VIDEO_QUALITY_PRESETS[state.quality] || VIDEO_QUALITY_PRESETS.balanced;
  state.rtc = new MeshRtcManager({
    selfId: state.peerId,
    signaling: state.signaling,
    localStream: getEffectiveLocalStream(),
    maxBitrate: preset.maxBitrate,
  });

  state.rtc.addEventListener('peer-added', ({ detail }) => {
    showToast(`${detail.name} joined the line`);
    playStudioChime(659.25, 100);
    renderStage();
  });

  state.rtc.addEventListener('peer-removed', ({ detail }) => {
    state.remoteMonitors.get(detail.peerId)?.stop();
    state.remoteMonitors.delete(detail.peerId);
    state.speakingPeers.delete(detail.peerId);
    state.peerStates.delete(detail.peerId);
    if (state.pinnedPeerId === detail.peerId) state.pinnedPeerId = null;
    showToast('A participant left the studio');
    renderStage();
  });

  state.rtc.addEventListener('remote-stream', ({ detail }) => {
    if (!state.remoteMonitors.has(detail.peerId) && detail.stream.getAudioTracks().length > 0) {
      const mon = new AudioLevelMonitor(detail.stream, (_level, speaking) => {
        const had = state.speakingPeers.has(detail.peerId);
        if (speaking !== had) {
          if (speaking) state.speakingPeers.add(detail.peerId);
          else state.speakingPeers.delete(detail.peerId);
          const tile = els.videoStage.querySelector(`[data-peer-tile="${detail.peerId}"]`);
          tile?.classList.toggle('is-speaking', speaking);
        }
      });
      state.remoteMonitors.set(detail.peerId, mon);
    }
    renderStage();
  });

  state.rtc.addEventListener('connection-state', () => {
    renderRoster();
  });

  state.rtc.addEventListener('datachannel-open', () => {
    broadcastLocalMediaState();
  });

  state.rtc.addEventListener('p2p-chat', ({ detail }) => {
    appendChatMessage({ author: detail.name, text: detail.text, ts: detail.ts });
  });

  state.rtc.addEventListener('reaction', ({ detail }) => {
    showToast(`${detail.name}: ${detail.emoji} ${detail.label || ''}`);
  });

  state.rtc.addEventListener('peer-media-state', ({ detail }) => {
    state.peerStates.set(detail.from, detail.state);
    renderStage();
  });

  state.rtc.addEventListener('file-progress', ({ detail }) => {
    els.fileProgressBar.classList.remove('hidden');
    const pct = Math.round((detail.received / Math.max(1, detail.total)) * 100);
    els.fileProgressLabel.textContent = `Receiving ${detail.name} (${pct}%)`;
    els.fileProgressFill.style.width = `${pct}%`;
    if (detail.received >= detail.total) {
      setTimeout(() => els.fileProgressBar.classList.add('hidden'), 1000);
    }
  });

  state.rtc.addEventListener('file-received', ({ detail }) => {
    appendChatMessage({
      author: detail.senderName,
      ts: Date.now(),
      fileUrl: detail.url,
      fileName: detail.name,
      fileSize: detail.size,
    });
    showToast(`Received file: ${detail.name}`);
  });

  state.rtc.addEventListener('stats-update', ({ detail }) => {
    updateDiagnosticsModal(detail.peers, detail.summary);
  });

  // Monitor local voice activity
  if (state.localStream) {
    state.vuMonitor?.stop();
    state.vuMonitor = new AudioLevelMonitor(state.localStream, (_level, speaking) => {
      const active = state.micEnabled && speaking;
      const had = state.speakingPeers.has('local');
      if (active !== had) {
        if (active) state.speakingPeers.add('local');
        else state.speakingPeers.delete('local');
        const tile = els.videoStage.querySelector('[data-peer-tile="local"]');
        tile?.classList.toggle('is-speaking', active);
      }
    });
  }

  syncCallControlButtons();
  renderStage();
  await state.signaling.start();
  els.callTransportBadge.textContent = state.signaling.getTransportSummary();

  if (mode === 'manual') {
    els.modalManualSdp.showModal();
  }
}

async function leaveStudioCall() {
  clearInterval(state.timerInterval);
  state.inCall = false;
  state.roomId = '';
  state.handRaised = false;
  state.pinnedPeerId = null;
  state.speakingPeers.clear();
  state.peerStates.clear();

  state.remoteMonitors.forEach((m) => m.stop());
  state.remoteMonitors.clear();

  if (state.screenSharing) {
    state.screenStream?.getTracks().forEach((t) => t.stop());
    state.screenStream = null;
    state.screenSharing = false;
  }

  state.rtc?.close();
  state.rtc = null;
  await state.signaling?.close();
  state.signaling = null;

  els.viewCall.classList.add('hidden');
  els.viewGreenroom.classList.remove('hidden');
  playStudioChime(440, 110);

  await initGreenroomMedia({
    audioDeviceId: els.selectAudioIn.value,
    videoDeviceId: els.selectVideoIn.value,
  });
}

async function copyInviteLink(buttonEl) {
  const code = normalizeRoomCode(state.roomId || els.inputRoom.value) || generateRoomCode();
  const url = `${window.location.origin}${window.location.pathname}#room=${encodeURIComponent(code)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast(`Invite link copied (${code})`);
    if (buttonEl) {
      const prev = buttonEl.textContent;
      if (!buttonEl.querySelector('.icon-slot')) {
        buttonEl.textContent = 'Copied';
        setTimeout(() => {
          buttonEl.textContent = prev;
        }, 1500);
      }
    }
  } catch {
    showToast(`Room code: ${code}`);
  }
}

function parseInitialRoomFromUrl() {
  const hashMatch = window.location.hash.match(/room=([^&]+)/i);
  const queryRoom = new URLSearchParams(window.location.search).get('room');
  const raw = hashMatch ? decodeURIComponent(hashMatch[1]) : queryRoom;
  return raw ? normalizeRoomCode(raw) : generateRoomCode();
}

function bindEvents() {
  els.btnNewCode.addEventListener('click', () => {
    els.inputRoom.value = generateRoomCode();
  });

  els.btnCopyInvite.addEventListener('click', () => copyInviteLink(els.btnCopyInvite));
  els.btnCallCopy.addEventListener('click', () => copyInviteLink(null));

  els.btnPreviewMirror.addEventListener('click', () => {
    state.mirrored = !state.mirrored;
    syncPreviewUi();
  });
  els.btnPreviewTestcard.addEventListener('click', toggleTestCard);
  els.btnPreviewMic.addEventListener('click', toggleMic);
  els.btnPreviewCam.addEventListener('click', toggleCam);
  els.btnTestChime.addEventListener('click', () => playStudioChime(587.33, 180));

  els.inputName.addEventListener('input', () => {
    els.previewAvatar.textContent = getInitials(els.inputName.value || 'Guest');
  });

  els.selectQuality.addEventListener('change', async () => {
    state.quality = els.selectQuality.value;
    await initGreenroomMedia({
      audioDeviceId: els.selectAudioIn.value,
      videoDeviceId: els.selectVideoIn.value,
    });
  });

  const handleDeviceSwitch = async (audioId, videoId, quality) => {
    state.quality = quality;
    const prevStream = state.localStream;
    const res = await acquireLocalMedia({
      audioDeviceId: audioId,
      videoDeviceId: videoId,
      quality,
      wantAudio: true,
      wantVideo: true,
      echoCancellation: state.echoCancellation,
      noiseSuppression: state.noiseSuppression,
    });
    if (res.stream) {
      prevStream?.getTracks().forEach((t) => t.stop());
      state.localStream = res.stream;
      res.stream.getAudioTracks().forEach((t) => {
        t.enabled = state.micEnabled;
      });
      res.stream.getVideoTracks().forEach((t) => {
        t.enabled = state.camEnabled;
      });

      if (state.inCall && state.rtc) {
        const effective = getEffectiveLocalStream();
        await state.rtc.replaceTracks({
          audioTrack: effective?.getAudioTracks()[0] || null,
          videoTrack: effective?.getVideoTracks()[0] || null,
        });
        const preset = VIDEO_QUALITY_PRESETS[quality] || VIDEO_QUALITY_PRESETS.balanced;
        await state.rtc.setMaxBitrate(preset.maxBitrate);
        renderStage();
      } else {
        syncPreviewUi();
      }
    }
  };

  els.selectAudioIn.addEventListener('change', () =>
    handleDeviceSwitch(els.selectAudioIn.value, els.selectVideoIn.value, els.selectQuality.value)
  );
  els.selectVideoIn.addEventListener('change', () =>
    handleDeviceSwitch(els.selectAudioIn.value, els.selectVideoIn.value, els.selectQuality.value)
  );

  els.callSelectAudio.addEventListener('change', () =>
    handleDeviceSwitch(els.callSelectAudio.value, els.callSelectVideo.value, els.callSelectQuality.value)
  );
  els.callSelectVideo.addEventListener('change', () =>
    handleDeviceSwitch(els.callSelectAudio.value, els.callSelectVideo.value, els.callSelectQuality.value)
  );
  els.callSelectQuality.addEventListener('change', () =>
    handleDeviceSwitch(els.callSelectAudio.value, els.callSelectVideo.value, els.callSelectQuality.value)
  );

  els.joinForm.addEventListener('submit', enterStudioCall);

  els.btnCallMic.addEventListener('click', toggleMic);
  els.btnCallCam.addEventListener('click', toggleCam);
  els.btnCallShare.addEventListener('click', toggleScreenShare);
  els.btnCallTestcard.addEventListener('click', toggleTestCard);
  els.btnCallHand.addEventListener('click', () => {
    state.handRaised = !state.handRaised;
    broadcastLocalMediaState();
    syncCallControlButtons();
    renderStage();
  });

  els.btnReactionMenu.addEventListener('click', () => {
    els.reactionTray.classList.toggle('hidden');
  });
  els.reactionTray.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-emoji]');
    if (!btn) return;
    const { emoji, label } = btn.dataset;
    state.rtc?.broadcastData({ type: 'reaction', emoji, label });
    showToast(`You: ${emoji} ${label}`);
    els.reactionTray.classList.add('hidden');
  });

  els.btnCallChat.addEventListener('click', () => openDock('chat'));
  els.btnCallPeople.addEventListener('click', () => openDock('people'));
  els.tabChat.addEventListener('click', () => {
    state.dockOpen = false;
    openDock('chat');
  });
  els.tabPeople.addEventListener('click', () => {
    state.dockOpen = false;
    openDock('people');
  });

  els.btnCallDiag.addEventListener('click', () => els.modalDiagnostics.showModal());
  els.btnDiagnosticsPill.addEventListener('click', () => els.modalDiagnostics.showModal());
  els.btnCallManual.addEventListener('click', () => els.modalManualSdp.showModal());
  els.btnCallLeave.addEventListener('click', leaveStudioCall);

  els.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();
    if (!text) return;
    els.chatInput.value = '';
    appendChatMessage({ author: `${state.name} (You)`, text, ts: Date.now(), self: true });

    const sentP2P = state.rtc?.broadcastData({ type: 'chat', name: state.name, text, ts: Date.now() }) || 0;
    if (sentP2P === 0) {
      await state.signaling?.sendChat(text).catch(() => {});
    }
  });

  els.btnAttachFile.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', async () => {
    const file = els.fileInput.files?.[0];
    els.fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_P2P_FILE_BYTES) {
      showToast('File limit is 25 MB for direct browser transfer.');
      return;
    }

    try {
      els.fileProgressBar.classList.remove('hidden');
      await state.rtc.sendFile(file, (sent, total) => {
        const pct = Math.round((sent / Math.max(1, total)) * 100);
        els.fileProgressLabel.textContent = `Sending ${file.name} (${pct}%)`;
        els.fileProgressFill.style.width = `${pct}%`;
      });
      appendChatMessage({
        author: `${state.name} (You)`,
        ts: Date.now(),
        self: true,
        fileUrl: URL.createObjectURL(file),
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (err) {
      showToast(err.message);
    } finally {
      setTimeout(() => els.fileProgressBar.classList.add('hidden'), 1000);
    }
  });

  // Settings Modal
  els.btnOpenSettings.addEventListener('click', () => {
    els.chkEcho.checked = state.echoCancellation;
    els.chkNoise.checked = state.noiseSuppression;
    const saved = loadCustomIceServers();
    els.inputCustomIce.value = saved.length ? JSON.stringify(saved, null, 2) : '';
    els.modalSettings.showModal();
  });

  els.btnSaveSettings.addEventListener('click', async () => {
    const rawIce = els.inputCustomIce.value.trim();
    if (rawIce) {
      try {
        const parsed = JSON.parse(rawIce);
        if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
        localStorage.setItem('openline.customIceServers', JSON.stringify(parsed));
      } catch {
        showToast('Invalid ICE JSON array.');
        return;
      }
    } else {
      localStorage.removeItem('openline.customIceServers');
    }

    state.echoCancellation = els.chkEcho.checked;
    state.noiseSuppression = els.chkNoise.checked;
    els.modalSettings.close();
    await initGreenroomMedia({
      audioDeviceId: els.selectAudioIn.value,
      videoDeviceId: els.selectVideoIn.value,
    });
    showToast('Studio preferences saved.');
  });

  els.btnResetIce.addEventListener('click', () => {
    localStorage.removeItem('openline.customIceServers');
    els.inputCustomIce.value = '';
    showToast('Cleared custom ICE servers.');
  });

  // Manual SDP Modal
  els.btnManualOffer.addEventListener('click', async () => {
    if (!state.rtc) return;
    const peer = state.rtc.ensurePeer(state.manualPeerId, 'Manual Peer', { autoNegotiate: false });
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    await new Promise((resolve) => {
      if (peer.pc.iceGatheringState === 'complete') return resolve();
      const onState = () => {
        if (peer.pc.iceGatheringState === 'complete') {
          peer.pc.removeEventListener('icegatheringstatechange', onState);
          resolve();
        }
      };
      peer.pc.addEventListener('icegatheringstatechange', onState);
      setTimeout(resolve, 1800);
    });
    els.manualLocalSdp.value = btoa(JSON.stringify(peer.pc.localDescription));
  });

  els.btnManualCopy.addEventListener('click', async () => {
    if (!els.manualLocalSdp.value) return;
    await navigator.clipboard.writeText(els.manualLocalSdp.value);
    showToast('Copied local SDP code.');
  });

  els.btnManualAccept.addEventListener('click', async () => {
    if (!state.rtc) return;
    try {
      const desc = JSON.parse(atob(els.manualRemoteSdp.value.trim()));
      const peer = state.rtc.ensurePeer(state.manualPeerId, 'Manual Peer', { autoNegotiate: false });
      await peer.pc.setRemoteDescription(desc);
      if (desc.type === 'offer') {
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await new Promise((resolve) => {
          if (peer.pc.iceGatheringState === 'complete') return resolve();
          const onState = () => {
            if (peer.pc.iceGatheringState === 'complete') {
              peer.pc.removeEventListener('icegatheringstatechange', onState);
              resolve();
            }
          };
          peer.pc.addEventListener('icegatheringstatechange', onState);
          setTimeout(resolve, 1800);
        });
        els.manualLocalSdp.value = btoa(JSON.stringify(peer.pc.localDescription));
        showToast('Answer generated — copy and send back to caller.');
      } else {
        showToast('Remote answer applied — connecting P2P.');
        els.modalManualSdp.close();
      }
    } catch {
      showToast('Invalid SDP block.');
    }
  });

  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.closeDialog)?.close();
    });
  });

  // Keyboard shortcuts during call (skip when typing in inputs)
  window.addEventListener('keydown', (e) => {
    if (!state.inCall) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.toLowerCase();
    if (key === 'm') toggleMic();
    else if (key === 'v') toggleCam();
    else if (key === 's') toggleScreenShare();
    else if (key === 'h') els.btnCallHand.click();
    else if (key === 'c') openDock('chat');
    else if (key === 'i') {
      if (els.modalDiagnostics.open) els.modalDiagnostics.close();
      else els.modalDiagnostics.showModal();
    } else if (key === 'e') leaveStudioCall();
  });
}

async function boot() {
  hydrateIcons();
  buildVuSegments();
  els.inputName.value = state.name || '';
  els.inputRoom.value = parseInitialRoomFromUrl();
  bindEvents();
  await initGreenroomMedia();
}

boot();
