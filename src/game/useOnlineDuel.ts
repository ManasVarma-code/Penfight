import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'react';
import { gameEngine } from './engine';
import type { OnlineFlick, OnlineStatus } from './onlineProtocol';

type Phase = 'idle' | 'searching' | 'playing' | 'reconnecting' | 'error';

export function useOnlineDuel() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [turnSeconds, setTurnSeconds] = useState<number | null>(null);
  const sessionRef = useRef<{ token?: string; stop: () => void } | null>(null);

  useEffect(() => () => sessionRef.current?.stop(), []);

  function leave() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    gameEngine.startAttractMode();
    setPhase('idle');
    setMessage('');
    setTurnSeconds(null);
  }

  function findMatch() {
    sessionRef.current?.stop();
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

    function release() {
      if (session.token) void request('session', { method: 'DELETE', keepalive: true }).catch(() => {});
    }

    function stop() {
      closed = true;
      clearTimeout(timer);
      release();
    }

    function fail(reason: string) {
      stop();
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
        if (Date.now() - lastSeen > 35_000) {
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
        const response = await request('join', { method: 'POST' });
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

  return { phase, message, turnSeconds, findMatch, leave };
}
