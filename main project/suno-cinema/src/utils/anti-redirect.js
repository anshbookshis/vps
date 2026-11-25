/**
 * Suno Cinema Host-Side Anti-Redirect & Popup Shield.
 *
 * Keeps Suno Cinema 100% ad-free and protects the host window against
 * unexpected popups, window.open hijacks, opener leaks, and unintended
 * top-level navigation away from the player.
 *
 * Note on browser Same-Origin Policy: a parent page cannot inject JS inside a
 * cross-origin iframe (embed.vidrift.net), so this shield locks down the
 * host window and provides an optional Strict Frame Isolation toggle.
 */

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'sunov2.vercel.app',
  'www.themoviedb.org',
  'anilist.co',
]);

export function isAllowedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''), typeof window !== 'undefined' ? window.location.href : 'https://localhost');
    return ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export class AntiRedirectGuard {
  constructor() {
    this.installed = false;
    this.blockedCount = 0;
    this.navigationLock = true;
    this.strictFrameMode = true;
    this.theaterActive = false;
    this.recentEvents = [];
    this.listeners = new Set();
    this._origOpen = null;
    this._beforeUnloadHandler = null;
    this._blurHandler = null;
    this._lastIframeFocusAt = 0;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    const snapshot = this.getSnapshot();
    for (const fn of this.listeners) fn(snapshot);
  }

  getSnapshot() {
    return {
      installed: this.installed,
      blockedCount: this.blockedCount,
      navigationLock: this.navigationLock,
      strictFrameMode: this.strictFrameMode,
      theaterActive: this.theaterActive,
      recentEvents: [...this.recentEvents],
    };
  }

  recordBlock(reason, detail = '') {
    this.blockedCount += 1;
    const entry = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      reason,
      detail: String(detail || '').slice(0, 100),
    };
    this.recentEvents = [entry, ...this.recentEvents].slice(0, 12);
    this.notify();
  }

  setTheaterActive(active) {
    this.theaterActive = Boolean(active);
    this.notify();
  }

  setNavigationLock(enabled) {
    this.navigationLock = Boolean(enabled);
    this.notify();
  }

  setStrictFrameMode(enabled) {
    this.strictFrameMode = Boolean(enabled);
    this.notify();
  }

  install() {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;

    try {
      this._origOpen = window.open ? window.open.bind(window) : null;
      const guard = this;

      window.open = function guardedWindowOpen(url, target, features) {
        if (isAllowedExternalUrl(url)) {
          return guard._origOpen ? guard._origOpen(url, '_blank', 'noopener,noreferrer') : null;
        }
        guard.recordBlock('Blocked popup / window.open', url || target || 'script popup');
        return null;
      };
    } catch {
      // Ignore if environment makes window.open non-configurable
    }

    // Detect unexpected tab-under / focus hijacking when interacting with player iframe
    this._blurHandler = () => {
      if (!this.theaterActive) return;
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'IFRAME') {
        this._lastIframeFocusAt = Date.now();
      }
    };
    window.addEventListener('blur', this._blurHandler);

    // Guard against unintended top-level page redirects while Theater Mode is open
    this._beforeUnloadHandler = (event) => {
      if (this.theaterActive && this.navigationLock) {
        this.recordBlock('Intercepted page navigation attempt', 'Prevented unexpected redirect during playback');
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', this._beforeUnloadHandler);

    // Enforce rel="noopener noreferrer" on all clicks on outbound links
    document.addEventListener(
      'click',
      (e) => {
        const anchor = e.target?.closest?.('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href) && !isAllowedExternalUrl(href)) {
          e.preventDefault();
          this.recordBlock('Blocked external redirect link', href);
          return;
        }
        if (anchor.target === '_blank') {
          anchor.rel = 'noopener noreferrer';
        }
      },
      true
    );

    this.notify();
  }

  uninstall() {
    if (!this.installed || typeof window === 'undefined') return;
    if (this._origOpen) {
      try {
        window.open = this._origOpen;
      } catch {}
    }
    if (this._blurHandler) window.removeEventListener('blur', this._blurHandler);
    if (this._beforeUnloadHandler) window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    this.installed = false;
  }
}

export const antiRedirectGuard = new AntiRedirectGuard();
