'use client';

import { useSyncExternalStore } from 'react';

// Tarayıcının "uygulamayı yükle" olayını (Chrome/Edge/Samsung) tek yerde tutar;
// banner ve footer butonu aynı durumu paylaşır. iOS Safari bu olayı hiç vermez,
// orada kullanıcıya "Paylaş → Ana Ekrana Ekle" adımı gösterilir.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallState = {
  mode: 'none' | 'prompt' | 'ios';
  installed: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { mode: 'none', installed: false };
const listeners = new Set<() => void>();
let initialized = false;

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS 13+ kendini Mac olarak tanıtır; dokunmatik ekran ile ayırt edilir
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function init() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  if (isStandalone()) {
    state = { mode: 'none', installed: true };
    return;
  }
  if (isIos()) state = { mode: 'ios', installed: false };
  // Olay layout'taki satır içi betikle yakalanıp window'a bırakılır (hidrasyondan önce gelebiliyor)
  const pick = () => {
    const e = (window as Window & { __bytInstallEvent?: BeforeInstallPromptEvent }).__bytInstallEvent;
    if (e && e !== deferred) {
      deferred = e;
      set({ mode: 'prompt' });
    }
  };
  pick();
  window.addEventListener('byt:install-ready', pick);
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ mode: 'none', installed: true });
  });
}

function subscribe(listener: () => void) {
  init();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverState: InstallState = { mode: 'none', installed: false };

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => state, () => serverState);
}

/** Yerel yükleme penceresini açar; iOS'ta false döner (talimat gösterilmeli). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  (window as Window & { __bytInstallEvent?: unknown }).__bytInstallEvent = undefined; // tek kullanımlık
  set({ mode: 'none', installed: outcome === 'accepted' });
  return true;
}

export const IOS_HINT_EVENT = 'byt:install-ios-hint';
