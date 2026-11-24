import { Capacitor } from '@capacitor/core';

export interface WebAdSenseConfig {
  enabled: boolean;
  clientId: string;
  slotDesktopLeft?: string;
  slotDesktopRight?: string;
  slotMenuBottom?: string;
}

function parseEnv(): Record<string, string | undefined> {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (metaEnv) return metaEnv;
  if (typeof process !== 'undefined' && process.env) return process.env;
  return {};
}

// Genuine Google AdSense Publisher Client ID format: ca-pub-16digits
const ADSENSE_CLIENT_REGEX = /^ca-pub-\d{16}$/;
const ADSENSE_SLOT_REGEX = /^\d{10}$/;

let scriptInjected = false;

export function getWebAdSenseConfig(): WebAdSenseConfig {
  // Web-only: NEVER run AdSense inside native Android/Capacitor app
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    return { enabled: false, clientId: '' };
  }

  const env = parseEnv();
  const rawEnabled = env.VITE_ADSENSE_ENABLED === 'true';
  const clientId = (env.VITE_ADSENSE_CLIENT_ID ?? '').trim();
  const slotDesktopLeft = (env.VITE_ADSENSE_SLOT_DESKTOP_LEFT ?? '').trim();
  const slotDesktopRight = (env.VITE_ADSENSE_SLOT_DESKTOP_RIGHT ?? '').trim();
  const slotMenuBottom = (env.VITE_ADSENSE_SLOT_MENU_BOTTOM ?? '').trim();

  // Disabled by default unless explicitly enabled AND a genuine publisher client ID is supplied
  const isValidClientId = ADSENSE_CLIENT_REGEX.test(clientId);
  const enabled = rawEnabled && isValidClientId;

  return {
    enabled,
    clientId: isValidClientId ? clientId : '',
    slotDesktopLeft: ADSENSE_SLOT_REGEX.test(slotDesktopLeft) ? slotDesktopLeft : undefined,
    slotDesktopRight: ADSENSE_SLOT_REGEX.test(slotDesktopRight) ? slotDesktopRight : undefined,
    slotMenuBottom: ADSENSE_SLOT_REGEX.test(slotMenuBottom) ? slotMenuBottom : undefined,
  };
}

export function isWebAdSenseActive(): boolean {
  return getWebAdSenseConfig().enabled;
}

export function ensureAdSenseScriptLoaded(clientId: string): void {
  if (scriptInjected || typeof document === 'undefined') return;
  if (!ADSENSE_CLIENT_REGEX.test(clientId)) return;

  const existing = document.querySelector(`script[src*="pagead2.googlesyndication.com"]`);
  if (existing) {
    scriptInjected = true;
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
  scriptInjected = true;
}
