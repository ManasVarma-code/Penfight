import { randomUUID } from 'node:crypto';
import express from 'express';
import { OnlineMatch, otherSide, parseFlick } from './onlineMatch';
import type { OnlineSide, OnlineStatus } from '../src/game/onlineProtocol';

const app = express();
app.disable('x-powered-by');
const SESSION_IDLE_MS = 45_000;
const RESULT_RETENTION_MS = 90_000;
const MAX_SESSIONS = 200;
const allowedOrigins = new Set(
  (process.env.ONLINE_ALLOWED_ORIGINS ?? 'https://localhost,http://localhost:3000,http://localhost:3001')
    .split(',').map(origin => origin.trim())
);

interface Session {
  token: string;
  seen: number;
  side?: OnlineSide;
  match?: OnlineMatch;
}
const sessions = new Map<string, Session>();
const queue = new Set<Session>();

function closeSession(session: Session, now: number) {
  queue.delete(session);
  if (session.side) session.match?.forfeit(session.side, now);
  sessions.delete(session.token);
}

function collectExpired(now: number) {
  for (const session of sessions.values()) {
    session.match?.expireTurn(now);
    if (now - session.seen >= SESSION_IDLE_MS
      || (session.match?.finishedAt && now - session.match.finishedAt >= RESULT_RETENTION_MS)) {
      closeSession(session, now);
    }
  }
}
setInterval(() => collectExpired(Date.now()), 1_000).unref();

app.use('/api/online', (req, res, next) => {
  const origin = req.get('Origin');
  if (origin && allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin).vary('Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}, express.json({ limit: '1kb' }));

app.post('/api/online/join', (_req, res) => {
  const now = Date.now();
  collectExpired(now);
  if (sessions.size >= MAX_SESSIONS) {
    res.sendStatus(503);
    return;
  }
  const token = randomUUID();
  const player: Session = { token, seen: now };
  sessions.set(token, player);
  const waiting = queue.values().next().value as Session | undefined;
  if (waiting) {
    queue.delete(waiting);
    const match = new OnlineMatch(now);
    waiting.match = player.match = match;
    waiting.side = 'p1';
    player.side = otherSide(waiting.side);
  } else {
    queue.add(player);
  }
  res.status(201).json({ token });
});

function getSession(authorization: string | undefined) {
  const token = authorization?.match(/^Bearer ([\da-f-]+)$/)?.[1];
  return token && sessions.get(token) || undefined;
}

app.get('/api/online/state', (req, res) => {
  const now = Date.now();
  collectExpired(now);
  const session = getSession(req.get('Authorization'));
  if (!session) {
    res.status(410).json({ status: 'expired' } satisfies OnlineStatus);
    return;
  }
  session.seen = now;
  if (!session.match || !session.side) {
    res.json({ status: 'waiting' } satisfies OnlineStatus);
    return;
  }
  const { state, replay } = session.match;
  res.json({
    status: 'matched', side: session.side, now, state,
    replay: replay && replay.endAt > now && req.query.revision !== String(state.revision)
      ? replay : undefined,
  } satisfies OnlineStatus);
});

app.post('/api/online/flick', (req, res) => {
  const now = Date.now();
  collectExpired(now);
  const session = getSession(req.get('Authorization'));
  if (!session?.match || !session.side) {
    res.sendStatus(410);
    return;
  }
  session.seen = now;
  const flick = parseFlick(req.body?.flick);
  const revision = req.body?.revision;
  if (!flick || !Number.isSafeInteger(revision) || revision < 0) {
    res.sendStatus(400);
    return;
  }
  res.sendStatus(session.match.play(session.side, revision, flick, now) ? 204 : 409);
});

app.delete('/api/online/session', (req, res) => {
  const session = getSession(req.get('Authorization'));
  if (session) closeSession(session, Date.now());
  res.sendStatus(204);
});

app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
app.use(express.static('dist'));
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => console.log(`Pen Fight Aura Wars online server listening on ${host}:${port}`));
