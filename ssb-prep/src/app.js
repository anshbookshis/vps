/**
 * SSB Command SPA Router & Shell Controller.
 */

import { loadState, saveState } from './engines/storage.js';
import { playCue } from './engines/audio-cues.js';
import { renderDashboardView } from './views/dashboard.js';
import { renderStage1View } from './views/stage1.js';
import { renderPsychView } from './views/psych.js';
import { renderPiqIoView } from './views/piq-io.js';
import { renderGtoView } from './views/gto.js';

const ROUTE_TITLES = {
  dashboard: 'Command Center',
  stage1: 'Day 1 • Stage I Screening',
  psych: 'Day 2 • Psychological Battery',
  piq: 'Personal Information & IO Grill',
  gto: 'Days 3–4 • GTO Planning & Lecturette',
};

let state = loadState();
let activeRoute = 'dashboard';
let activeCleanup = null;

const shellEl = document.querySelector('#app-shell');
const viewRoot = document.querySelector('#view-root');
const routeLabelEl = document.querySelector('#active-route-label');
const muteBtn = document.querySelector('#btn-toggle-mute');
const focusBtn = document.querySelector('#btn-toggle-focus');

function updateMuteUi() {
  muteBtn.textContent = state.muted ? 'Sound: Muted' : 'Sound: On';
}

function setState(next) {
  state = next;
  updateMuteUi();
}

function navigate(route, subTab = null) {
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }

  activeRoute = ROUTE_TITLES[route] ? route : 'dashboard';
  routeLabelEl.textContent = ROUTE_TITLES[activeRoute];

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === activeRoute);
  });

  const ctx = { state, setState, navigate };

  if (activeRoute === 'dashboard') {
    activeCleanup = renderDashboardView(viewRoot, ctx) || null;
  } else if (activeRoute === 'stage1') {
    activeCleanup = renderStage1View(viewRoot, ctx, subTab || 'ppdt') || null;
  } else if (activeRoute === 'psych') {
    activeCleanup = renderPsychView(viewRoot, ctx, subTab || 'tat') || null;
  } else if (activeRoute === 'piq') {
    activeCleanup = renderPiqIoView(viewRoot, ctx) || null;
  } else if (activeRoute === 'gto') {
    activeCleanup = renderGtoView(viewRoot, ctx, subTab || 'lecturette') || null;
  }
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

muteBtn.addEventListener('click', () => {
  state.muted = !state.muted;
  saveState(state);
  updateMuteUi();
});

document.querySelector('#btn-test-bell').addEventListener('click', () => {
  playCue('start', false);
});

focusBtn.addEventListener('click', () => {
  const isFocused = shellEl.classList.toggle('focus-mode');
  focusBtn.textContent = isFocused ? 'Show Navigation' : 'Test-Hall Focus Mode';
});

updateMuteUi();
navigate('dashboard');
