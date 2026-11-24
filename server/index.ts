import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { OnlineMatch, otherSide, parseFlick } from './onlineMatch';
import { getRank } from './competition';
import { loadCompetition } from './competitionConfig';
import { ONLINE_PEN, type OnlineSide, type OnlineStatus } from './rankedGame/onlineProtocol';
import { getOpponentByIndex, PENS } from './rankedGame/content';
import { getAuraRank, rankedSearchRange } from './rankedGame/ranking';
import { createRankedAuth } from './rankedAuth';

const app = express();
app.disable('x-powered-by');
const SESSION_IDLE_MS = 45_000;
const RESULT_RETENTION_MS = 90_000;
const PRACTICE_WAIT_MS = 12_000;
const MAX_SESSIONS = 200;
const competition = loadCompetition();
const allowedOrigins = new Set(
  (process.env.ONLINE_ALLOWED_ORIGINS ?? 'https://localhost,http://localhost:3000,http://localhost:3001')
    .split(',').map(origin => origin.trim())
);

interface Session {
  token: string;
  seen: number;
  side?: OnlineSide;
  match?: OnlineMatch;
  accountId?: string;
  ranked?: { queuedAt: number; rating: number; displayName: string; penId: string };
}
const sessions = new Map<string, Session>();
const queue = new Set<Session>();
const rankedQueue = new Set<Session>();
const authenticatedMatches = new WeakMap<OnlineMatch,
  { id: string; p1: string; p2: string; practice: boolean } | { id: string; p1: string; rival: number }>();
const recordedMatches = new WeakMap<OnlineMatch, Promise<unknown>>();
const rankedPlayers = new WeakMap<OnlineMatch, Record<OnlineSide, NonNullable<Session['ranked']>>>();

let matching: Promise<void> | undefined;
function matchRanked(now: number) {
  if (rankedQueue.size < 2) return;
  matching ??= pairRanked(now).finally(() => { matching = undefined; });
  return matching;
}

async function pairRanked(now: number) {
  if (!competition) return;
  for (const first of rankedQueue) {
    const search = first.ranked!;
    let best: Session | undefined;
    let bestGap = Infinity;
    for (const second of rankedQueue) {
      if (first === second) continue;
      const candidate = second.ranked!;
      const gap = Math.abs(search.rating - candidate.rating);
      const range = Math.min(rankedSearchRange(now - search.queuedAt), rankedSearchRange(now - candidate.queuedAt));
      if (gap > range || gap >= bestGap || !await competition.store.rankPairEligible(first.accountId!, second.accountId!, now)) continue;
      best = second;
      bestGap = gap;
    }
    if (best) pairRankedSessions(first, best, false);
  }

  // Once rated pairings are exhausted, let remaining players duel without rating changes.
  const waiting = [...rankedQueue].filter(player => now - player.ranked!.queuedAt >= PRACTICE_WAIT_MS);
  for (const first of waiting) {
    if (!rankedQueue.has(first)) continue;
    let best: Session | undefined;
    let bestGap = Infinity;
    for (const second of waiting) {
      if (first.accountId === second.accountId || !rankedQueue.has(second)) continue;
      const gap = Math.abs(first.ranked!.rating - second.ranked!.rating);
      if (gap >= bestGap) continue;
      best = second;
      bestGap = gap;
    }
    if (best) pairRankedSessions(first, best, true);
  }
}

function pairRankedSessions(first: Session, second: Session, practice: boolean) {
  if (!rankedQueue.has(first) || !rankedQueue.has(second)) return;
  rankedQueue.delete(first);
  rankedQueue.delete(second);
  const now = Date.now();
  const match = new OnlineMatch(now);
  match.startAfterIntro(now);
  first.side = 'p1';
  second.side = 'p2';
  first.match = second.match = match;
  rankedPlayers.set(match, { p1: first.ranked!, p2: second.ranked! });
  authenticatedMatches.set(match, { id: randomUUID(), p1: first.accountId!, p2: second.accountId!, practice });
}

function recordResult(match: OnlineMatch, now: number): Promise<unknown> | undefined {
  const meta = authenticatedMatches.get(match);
  const winner = match.state.winner;
  if (!competition || !meta || !winner) return;
  if ('practice' in meta && meta.practice) return;
  const recorded = recordedMatches.get(match);
  if (recorded) return recorded;
  const completed = match.state.score[winner] === 2;
  const players = 'rival' in meta ? undefined : { p1: meta.p1, p2: meta.p2 };
  const pending = Promise.resolve().then(() => {
    if ('rival' in meta && completed) return competition.store.settleTournament(meta.id, meta.p1, meta.rival, winner === 'p1', now);
    if (players && (completed || match.playedSides.size === 2)) {
      return competition.store.settleRanked(meta.id, players[winner], players[otherSide(winner)], now, completed);
    }
  }).catch(error => {
    recordedMatches.delete(match);
    throw error;
  });
  recordedMatches.set(match, pending);
  return pending;
}

function reportStoreFailure() { console.error('Ranked storage operation failed.'); }

function closeSession(session: Session, now: number) {
  queue.delete(session);
  rankedQueue.delete(session);
  sessions.delete(session.token);
  if (session.side && session.match) {
    session.match.forfeit(session.side, now);
    return recordResult(session.match, now);
  }
}

function collectExpired(now: number) {
  for (const session of sessions.values()) {
    const match = session.match;
    if (match && (!session.ranked || match.state.turn === session.side)) {
      if (session.ranked) match.allowReconnect(now, session.seen);
      match.expireTurn(now);
      match.playAi(now);
      recordResult(match, now)?.catch(reportStoreFailure);
    }
    if (now - session.seen >= SESSION_IDLE_MS
      || (session.match?.finishedAt && now - session.match.finishedAt >= RESULT_RETENTION_MS)) {
      closeSession(session, now)?.catch(reportStoreFailure);
    }
  }
  matchRanked(now)?.catch(reportStoreFailure);
}
setInterval(() => collectExpired(Date.now()), 1_000).unref();

const smallOnlineBody = express.json({ limit: '1kb' });
const offlineBackupBody = express.json({ limit: '48kb' });
app.use('/api/online', (req, res, next) => {
  const origin = req.get('Origin');
  if (origin && allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin).vary('Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}, (req, res, next) => {
  const parser = req.method === 'PUT' && req.path === '/competition/offline-backup' ? offlineBackupBody : smallOnlineBody;
  parser(req, res, next);
});

const route = (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => { void handler(req, res).catch(next); };

app.get('/api/online/competition/offline-backup', route(async (req, res) => {
  const identity = await competition?.verifyIdentity(req.get('Authorization'));
  if (!competition || !identity) { res.sendStatus(competition ? 401 : 503); return; }
  const slot = createHash('sha256').update(identity.id).digest('hex');
  res.json({ slot, backup: await competition.store.getOfflineBackup(identity.id) });
}));

app.put('/api/online/competition/offline-backup', route(async (req, res) => {
  const identity = await competition?.verifyIdentity(req.get('Authorization'));
  if (!competition || !identity) { res.sendStatus(competition ? 401 : 503); return; }
  const { version, progress } = req.body ?? {};
  if (!Number.isInteger(version) || version < 0 || version >= 2147483647 ||
      !progress || progress.schemaVersion !== 1 || !Number.isSafeInteger(progress.coins) || progress.coins < 0) {
    res.sendStatus(400);
    return;
  }
  if (!await competition.store.putOfflineBackup(identity.id, version, progress)) { res.sendStatus(409); return; }
  res.json({ version: version + 1 });
}));

app.get('/api/online/competition/availability', route(async (_req, res) => {
  const ranked = !!competition && await competition.ready().then(() => true, () => false);
  res.json({ ranked, google: ranked && !!competition?.auth });
}));
if (competition?.auth) {
  app.use('/api/online', createRankedAuth(competition.store, competition.auth));
}
app.post(['/api/online/auth/google', '/api/online/auth/google/check'], (_req, res) => { res.sendStatus(503); });
app.get(['/api/online/auth/google/start/:launch', '/api/online/auth/google/callback'],
  (_req, res) => { res.sendStatus(503); });

app.post('/api/online/join', route(async (req, res) => {
  const now = Date.now();
  collectExpired(now);
  if (sessions.size >= MAX_SESSIONS) {
    res.sendStatus(503);
    return;
  }
  const mode = req.body?.mode ?? 'guest';
  if (mode !== 'guest' && mode !== 'ranked' && mode !== 'verified_tournament') {
    res.sendStatus(400);
    return;
  }
  const penId = req.body?.penId;
  if (mode === 'ranked' && penId !== undefined && !PENS.some(pen => pen.id === penId)) {
    res.sendStatus(400);
    return;
  }
  const identity = mode === 'guest' ? null : await competition?.verifyIdentity(req.get('Authorization'));
  if (mode !== 'guest' && (!competition || !identity)) {
    res.sendStatus(competition ? 401 : 503);
    return;
  }
  if (identity && [...sessions.values()].some(player => player.accountId === identity.id && !player.match?.state.winner)) {
    res.sendStatus(409);
    return;
  }
  if (identity) {
    await Promise.all([...sessions.values()].filter(session => session.accountId === identity.id && session.match)
      .map(session => recordResult(session.match!, now)));
  }
  const profile = identity && await competition!.store.open(identity);
  if (mode === 'ranked' && identity && profile && penId && penId !== ONLINE_PEN && !profile.ownedPens.includes(penId)) {
    const backup = await competition!.store.getOfflineBackup(identity.id);
    const unlocked = backup?.progress.unlockedPens;
    if (!Array.isArray(unlocked) || !unlocked.includes(penId)) {
      res.sendStatus(403);
      return;
    }
  }
  const token = randomUUID();
  const player: Session = { token, seen: now, accountId: identity?.id };
  const rival = req.body?.rival;
  if (mode === 'verified_tournament') {
    if (!identity || !await competition?.store.canFightRival(identity.id, rival)) {
      res.sendStatus(403);
      return;
    }
    player.match = new OnlineMatch(now, getOpponentByIndex(rival), profile ? profile.equippedPen : undefined);
  }
  if (identity && [...sessions.values()].some(session => session.accountId === identity.id && !session.match?.state.winner)) {
    res.sendStatus(409);
    return;
  }
  if (sessions.size >= MAX_SESSIONS) {
    res.sendStatus(503);
    return;
  }
  if (mode === 'verified_tournament' && identity && player.match) {
    player.side = 'p1';
    authenticatedMatches.set(player.match, { id: randomUUID(), p1: identity.id, rival });
    sessions.set(token, player);
    res.status(201).json({ token });
    return;
  }
  sessions.set(token, player);
  if (mode === 'ranked' && profile) {
    player.ranked = { queuedAt: now, rating: profile.rating, displayName: profile.displayName, penId: penId ?? ONLINE_PEN };
    rankedQueue.add(player);
    matchRanked(now)?.catch(reportStoreFailure);
    res.status(201).json({ token });
    return;
  }
  const waiting = queue.values().next().value;
  if (waiting) {
    queue.delete(waiting);
    const match = new OnlineMatch(now, undefined, undefined, true);
    waiting.match = player.match = match;
    waiting.side = 'p1';
    player.side = otherSide(waiting.side);
  } else {
    queue.add(player);
  }
  res.status(201).json({ token });
}));

function getSession(authorization: string | undefined) {
  const token = authorization?.match(/^Bearer ([\da-f-]+)$/)?.[1];
  return token && sessions.get(token) || undefined;
}

async function sendMatchState(session: Session, match: OnlineMatch, side: OnlineSide, req: Request, res: Response) {
  const now = Date.now();
  const { state, replay } = match;
  const includeReplay = replay && req.query.revision !== String(state.revision)
    && (req.query.presentation === '1' || replay.endAt > now);
  const meta = authenticatedMatches.get(match);
  const players = rankedPlayers.get(match);
  // Deliver the final shot before waiting for the rating receipt from storage.
  const practice = !!(meta && 'practice' in meta && meta.practice);
  const resultReady = state.winner && !includeReplay && !practice;
  if (resultReady) await recordResult(match, now);
  const ranked = meta && players && session.accountId ? {
    id: meta.id,
    startsAt: match.startsAt,
    practice: practice || undefined,
    players: {
      p1: { displayName: players.p1.displayName, rating: players.p1.rating, penId: players.p1.penId },
      p2: { displayName: players.p2.displayName, rating: players.p2.rating, penId: players.p2.penId },
    },
    result: resultReady ? await competition?.store.rankedResult(meta.id, session.accountId) : undefined,
  } : undefined;
  res.json({
    status: 'matched', side, now, state, ranked, replay: includeReplay ? replay : undefined,
  } satisfies OnlineStatus);
}

app.get('/api/online/state', route(async (req, res) => {
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
  await sendMatchState(session, session.match, session.side, req, res);
}));

app.post('/api/online/flick', route(async (req, res) => {
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
  const accepted = session.match.play(session.side, revision, flick, now);
  if (accepted) recordResult(session.match, Date.now())?.catch(reportStoreFailure);
  if (accepted && session.ranked && req.query.presentation === '1') {
    await sendMatchState(session, session.match, session.side, req, res);
    return;
  }
  res.sendStatus(accepted ? 204 : 409);
}));

app.delete('/api/online/session', route(async (req, res) => {
  const session = getSession(req.get('Authorization'));
  if (session) await closeSession(session, Date.now());
  const meta = session?.match && authenticatedMatches.get(session.match);
  const result = meta && 'practice' in meta && !meta.practice && session?.accountId
    && await competition?.store.rankedResult(meta.id, session.accountId);
  if (result) { res.json({ result }); return; }
  res.sendStatus(204);
}));

app.get('/api/online/leaderboards/:board', route(async (req, res) => {
  const board = req.params.board;
  if (board !== 'ranked' && board !== 'tournament' && board !== 'wealth') { res.sendStatus(404); return; }
  if (!competition) { res.sendStatus(503); return; }
  res.json({ rows: await competition.store.leaderboard(board) });
}));

app.get('/api/online/competition/profile', route(async (req, res) => {
  const identity = await competition?.verifyIdentity(req.get('Authorization'));
  if (!competition || !identity) { res.sendStatus(competition ? 401 : 503); return; }
  const { id: _private, ...profile } = await competition.store.open(identity);
  res.json({ ...profile, rank: getRank(profile.rating), division: getAuraRank(profile.rating).label,
    history: await competition.store.rankedHistory(identity.id) });
}));

app.post('/api/online/competition/pens/:id', route(async (req, res) => {
  const identity = await competition?.verifyIdentity(req.get('Authorization'));
  if (!competition || !identity) { res.sendStatus(competition ? 401 : 503); return; }
  res.sendStatus(await competition.store.buy(identity.id, req.params.id) ? 204 : 409);
}));

const onlineError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  if (error?.status === 400 || error?.status === 413) { res.sendStatus(error.status); return; }
  reportStoreFailure();
  res.sendStatus(503);
};
app.use('/api/online', onlineError);

app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
app.use(express.static('dist'));
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const server = app.listen(port, host, () => {
  const address = server.address();
  console.log(`Pen Fight Aura Wars online server listening on ${host}:${typeof address === 'object' && address ? address.port : port}`);
});
