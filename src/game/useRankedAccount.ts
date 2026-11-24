import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RankedProfile } from './ranking';

const sessionKey = 'pen_fight_ranked_session';
const challengeKey = 'pen_fight_ranked_google_pending';
const origin = (import.meta.env.VITE_ONLINE_SERVER_URL ?? '').trim().replace(/\/+$/, '');
const base = `${origin}/api/online`;
const android = Capacitor.getPlatform() === 'android';
const browser = registerPlugin<{
  open(input: { url: string }): Promise<void>;
  addListener(event: 'returnToGame', callback: () => void): Promise<PluginListenerHandle>;
}>('RankedBrowser');
type Challenge = { check: string; url: string; expires: number };

function savedChallenge(): Challenge | null {
  if (!android) return null;
  try {
    const raw = localStorage.getItem(challengeKey);
    if (!raw) return null;
    const value: Challenge = JSON.parse(raw);
    if (/^[\w-]{43}$/.test(value.check) && value.expires > Date.now()) return value;
    localStorage.removeItem(challengeKey);
  } catch { /* An unavailable storage area does not prevent sign-in. */ }
  return null;
}

function savedToken(): string | null {
  try { return localStorage.getItem(sessionKey); } catch { return null; }
}

export function useRankedAccount() {
  const [token, setToken] = useState(savedToken);
  const activeToken = useRef(token);
  const signInAttempt = useRef(0);
  const [profile, setProfile] = useState<RankedProfile | null>(null);
  const [challenge, setChallenge] = useState(savedChallenge);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const updateChallenge = useCallback((value: Challenge | null) => {
    if (android) {
      try {
        if (value) localStorage.setItem(challengeKey, JSON.stringify(value));
        else localStorage.removeItem(challengeKey);
      } catch { /* The current WebView can still complete sign-in. */ }
    }
    setChallenge(value);
  }, []);

  const save = useCallback((value: string | null) => {
    activeToken.current = value;
    try {
      if (value) localStorage.setItem(sessionKey, value);
      else localStorage.removeItem(sessionKey);
    } catch { /* In-memory sign-in still works. */ }
    setToken(value);
    if (!value) setProfile(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${base}/competition/profile`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000),
      });
      if (activeToken.current !== token) return;
      if (response.status === 401) { save(null); return; }
      if (response.ok) {
        const data: RankedProfile = await response.json();
        if (activeToken.current === token && Number.isFinite(data.rating) && Array.isArray(data.history)) setProfile(data);
      }
    } catch { /* Keep the last verified profile during a connection interruption. */ }
  }, [save, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  function cancel() {
    signInAttempt.current++;
    setPending(false);
    updateChallenge(null);
    setMessage('');
  }

  async function start(mode: 'signin' | 'signup', details?: { displayName: string; fullName: string }) {
    if (pending || challenge) return;
    const attempt = ++signInAttempt.current;
    setPending(true);
    setMessage('');
    try {
      if (!origin && Capacitor.isNativePlatform()) throw new Error('Ranked is unavailable in this build.');
      const response = await fetch(`${base}/auth/google`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ...details, returnToApp: android }),
        signal: AbortSignal.timeout(7000),
      });
      if (response.status === 400) throw new Error('Check the name and username, then try again.');
      if (!response.ok) throw new Error('Google sign-in is unavailable. You can still play as a guest.');
      const data = await response.json();
      const url = new URL(data.url);
      if (url.origin !== new URL(origin || window.location.origin).origin
        || !/^\/api\/online\/auth\/google\/start\/[\w-]{43}$/.test(url.pathname)
        || typeof data.check !== 'string' || !/^[\w-]{43}$/.test(data.check)) throw new Error('Invalid sign-in response.');
      if (signInAttempt.current !== attempt) return;
      updateChallenge({ check: data.check, url: url.href, expires: Date.now() + 5 * 60_000 });
      if (android) {
        try { await browser.open({ url: url.href }); }
        catch {
          if (signInAttempt.current === attempt) {
            updateChallenge(null);
            setMessage('Could not open Google sign-in. Try again with a browser installed.');
          }
        }
      }
    } catch (error) {
      if (signInAttempt.current === attempt) setMessage(error instanceof Error ? error.message : 'Sign-in is unavailable.');
    } finally {
      if (signInAttempt.current === attempt) setPending(false);
    }
  }

  useEffect(() => {
    if (!challenge) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const activeChallenge = challenge;
    let request: AbortController | undefined;
    async function check() {
      if (cancelled || request || document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      if (Date.now() >= activeChallenge.expires) {
        updateChallenge(null);
        setMessage('Sign-in expired. Try again.');
        return;
      }
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${base}/auth/google/check`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ check: activeChallenge.check }),
          signal: controller.signal,
        });
        if (cancelled) return;
        if (response.ok && response.status !== 202) {
          const data = await response.json();
          if (!cancelled && typeof data.token === 'string') { save(data.token); updateChallenge(null); return; }
        } else if (response.status === 404 || response.status === 410) {
          updateChallenge(null);
          setMessage(response.status === 404
            ? 'There’s no game profile for that Google account yet. Choose Sign up to create one.'
            : 'Sign-in expired or was cancelled. Try again.');
          return;
        }
      } catch { /* Retry when the browser hands control back to the game. */ }
      finally { clearTimeout(timeout); request = undefined; }
      if (cancelled) return;
      timer = setTimeout(check, 1800);
    }
    const resume = () => { void check(); };
    const listener = android ? browser.addListener('returnToGame', resume).catch(() => undefined) : undefined;
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    void check();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      void listener?.then(handle => handle?.remove()).catch(() => {});
      request?.abort();
      clearTimeout(timer);
    };
  }, [challenge, save, updateChallenge]);

  function signOut() {
    if (!token) return;
    save(null);
    void fetch(`${base}/auth/session`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {});
  }

  return { token, profile, challenge, message, pending, cancel, start, refresh, signOut };
}
