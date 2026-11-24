import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'react';
import { gameEngine } from './engine';
import type { DuelMode, OnlineFlick, OnlineStatus } from './onlineProtocol';
import type { RankedHistoryEntry } from './ranking';

type Phase = 'idle' | 'searching' | 'playing' | 'reconnecting' | 'error';

export function useOnlineDuel() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [turnSeconds, setTurnSeconds] = useState<number | null>(null);
  const [mode, setMode] = useState<DuelMode>('guest');
  const [rankedPair, setRankedPair] = useState<Extract<OnlineStatus, { status: 'matched' }>>();
  const [result, setResult] = useState<RankedHistoryEntry>();
  const [versus, setVersus] = useState(false);
  const sessionRef = useRef<{ token?: string; stop: (release?: boolean) => Promise<RankedHistoryEntry | undefined> } | null>(null);

  useEffect(() => () => { void sessionRef.current?.stop(); }, []);

  async function leave() {
    const leaving = sessionRef.current?.stop();
    sessionRef.current = null;
    gameEngine.startAttractMode();
    setPhase('idle');
    setMessage('');
    setTurnSeconds(null);
    setVersus(false);
    setRankedPair(undefined);
    setResult(undefined);
    return leaving;
  }

  function findMatch(nextMode: DuelMode = 'guest', accountToken?: string | null) {
    const prior = sessionRef.current?.stop();
    if (sessionRef.current) gameEngine.startAttractMode();
    setMode(nextMode);
    setResult(undefined);
    setRankedPair(undefined);
    setVersus(false);
    setMessage('');
    const origin = (import.meta.env.VITE_ONLINE_SERVER_URL ?? '').trim().replace(/\/+$/, '');
    if (!origin && Capacitor.isNativePlatform()) {
      setPhase('error');
      setMessage('The online server is not configured for this build.');
      return;
    }
    const base = `${origin}/api/online`;
    setPhase('searching');
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let revision = -1;
    let hadMatch = false;
    let lastSeen = Date.now();
    let intro: ReturnType<typeof setTimeout> | undefined;
    const session: NonNullable<typeof sessionRef.current> = { stop };
    sessionRef.current = session;

    function request(path: string, init: RequestInit = {}) {
      return fetch(`${base}/${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(path === 'join' ? 90_000 : 6_000),
      });
    }

    async function release(): Promise<RankedHistoryEntry | undefined> {
      if (!session.token) return;
      try {
        const response = await request('session', { method: 'DELETE', keepalive: true });
        if (response.ok && response.status === 200) return (await response.json()).result;
      } catch { /* An expired connection is resolved by the server. */ }
    }

    async function stop(shouldRelease = true) {
      closed = true;
      clearTimeout(timer);
      clearTimeout(intro);
      return shouldRelease ? release() : undefined;
    }

    function fail(reason: string) {
      void stop(false);
      setVersus(false);
      gameEngine.startAttractMode();
      setMessage(reason);
      setPhase('error');
    }

    async function submit(turnRevision: number, flick: OnlineFlick) {
      if (closed) throw new Error('Online session closed');
      const result = await request('flick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: turnRevision, flick }),
      });
      if (!result.ok) throw new Error('Server declined this flick');
    }

    async function poll() {
      try {
        const response = await request(`state?revision=${revision}`);
        if (closed) return;
        if (response.status === 410) {
          fail('The online session ended. Find another match to play again.');
          return;
        }
        if (!response.ok) throw new Error('Could not reach the server');
        const status: OnlineStatus = await response.json();
        if (closed) return;
        lastSeen = Date.now();
        if (status.status === 'matched') {
          const introTime = status.ranked ? status.ranked.startsAt - status.now : 0;
          if (!hadMatch && status.ranked && !status.state.winner && introTime > 0) {
            setRankedPair(status);
            setVersus(true);
            intro = setTimeout(() => setVersus(false), introTime);
          }
          if (status.ranked?.result) setResult(status.ranked.result);
          hadMatch = true;
          revision = status.state.revision;
          gameEngine.setOnlineState(status, submit);
          setTurnSeconds(Math.max(0, Math.min(30, Math.ceil((status.state.deadline - status.now) / 1000))));
          setPhase('playing');
          setMessage('');
        } else {
          setPhase('searching');
          setMessage('');
        }
      } catch {
        if (closed) return;
        if (Date.now() - lastSeen > (nextMode === 'ranked' && hadMatch ? 50_000 : 35_000)) {
          fail('The match server could not be reached.');
          return;
        }
        setPhase('reconnecting');
        setMessage('Connection interrupted. Reconnecting…');
      }
      if (!closed) timer = setTimeout(poll, hadMatch ? 250 : 700);
    }

    void (async () => {
      try {
        await prior;
        if (closed) return;
        const response = await request('join', nextMode === 'ranked' ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accountToken && { Authorization: `Bearer ${accountToken}` }) },
          body: JSON.stringify({ mode: 'ranked' }),
        } : { method: 'POST' });
        if (response.status === 401) { fail('Sign in again to join Ranked 1v1.'); return; }
        if (response.status === 409) { fail('Your account already has an active match.'); return; }
        if (response.status === 503 && nextMode === 'ranked') { fail('Ranked matchmaking is currently unavailable.'); return; }
        if (!response.ok) throw new Error('Join failed');
        const joined: { token: string } = await response.json();
        session.token = joined.token;
        if (closed) release();
        else void poll();
      } catch {
        if (!closed) fail('Could not join the online queue. Try again in a moment.');
      }
    })();
  }

  return { phase, message, turnSeconds, mode, rankedPair, result, versus, findMatch, leave };
}
