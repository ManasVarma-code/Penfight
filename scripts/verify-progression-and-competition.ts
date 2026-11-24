import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import express from 'express';
import { CompetitionStore, createIdentityVerifier, eloDelta, getRank } from '../server/competition';
import { createRankedAuth } from '../server/rankedAuth';
import { OnlineMatch } from '../server/onlineMatch';
import { AURA_DIVISIONS, getAuraRank, rankedSearchRange } from '../src/game/ranking';
import { PENS } from '../src/game/content';
import { getPenRequirement, getTournamentAchievements } from '../src/game/progression';
import { getWeeklyTournament, weeklyWins, WEEKLY_REWARDS } from '../src/game/weeklyTournament';

const localData = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => localData.get(key) ?? null,
  setItem: (key: string, value: string) => localData.set(key, value),
} });
localStorage.setItem('pen_fight_royale_profile_v1', JSON.stringify({
  schemaVersion: 1, coins: 21_000, highestTournamentOpponent: 7, tournamentWins: 9,
  unlockedPens: ['classic_ballpoint', 'gold_fountain'], equippedPenId: 'gold_fountain',
  penMastery: { gold_fountain: 2 }, penGripLevels: { gold_fountain: 1 },
}));

const { currentOfflineSlot, offlineProgress, profileRepo, switchOfflineSlot } = await import('../src/game/persistence');
const read = () => profileRepo.get();
assert.deepEqual(PENS.map(pen => pen.unlockCoins), [0, 20_000, 40_000, 92_000, 230_000, 621_000]);
assert.equal(read().defeatedRivals.length, 7);
assert.equal(read().coins, 21_000);
assert.equal(read().equippedPenId, 'gold_fountain');
assert.equal(read().penMastery.gold_fountain, 2);
assert.equal(read().penGripLevels.gold_fountain, 1);
assert.equal(read().lifetimeAuraEarned, 21_000);
assert.ok(getTournamentAchievements(read().defeatedRivals, true).some(badge => badge.title === 'Golden Legacy' && badge.earned));
assert.equal(profileRepo.buyPen('hyper_gel'), false);
assert.equal(profileRepo.settleTournamentMatch('locked', 8, true, false, false), null);
const first = profileRepo.settleTournamentMatch('first', 7, true, true, true)!;
assert.equal(first.achievementBonus, 2500);
assert.ok(first.firstClearBonus > first.baseCoins);
assert.equal(first.doubleCoinsBonus, first.baseCoins + 220);
assert.equal(read().highestTournamentOpponent, 8);
assert.equal(profileRepo.settleTournamentMatch('first', 7, true, true, true), null);
assert.equal(profileRepo.claimTournamentDouble('first', first.doubleCoinsBonus + 1), false);
assert.equal(profileRepo.claimTournamentDouble('first', first.doubleCoinsBonus), true);
assert.equal(profileRepo.claimTournamentDouble('first', first.doubleCoinsBonus), false);
const beforePurchase = read().lifetimeAuraEarned;
assert.equal(profileRepo.buyPen('hyper_gel'), true);
assert.equal(read().lifetimeAuraEarned, beforePurchase);
assert.equal(getPenRequirement(16, [...Array.from({ length: 15 }, (_, index) => index), 16]).met, false);
const second = profileRepo.settleTournamentMatch('second', 7, true, false, false)!;
assert.equal(second.firstClearBonus + second.achievementBonus, 0);
assert.ok(second.baseCoins < first.baseCoins);
assert.equal(profileRepo.claimTournamentDouble('second', second.doubleCoinsBonus), true);
assert.equal(profileRepo.settleTournamentMatch('third', 7, true, false, false)?.doubleCoinsBonus, 0);
const beforeLoss = read();
const loss = profileRepo.settleTournamentMatch('loss', 8, false, false, true)!;
assert.equal(loss.doubleCoinsBonus, 0);
assert.equal(loss.firstCritBonus, 0);
assert.equal(loss.totalCoins, 210);
assert.equal(read().coins, beforeLoss.coins + loss.totalCoins);
assert.equal(read().lifetimeAuraEarned, beforeLoss.lifetimeAuraEarned + loss.totalCoins);
assert.equal(profileRepo.settleTournamentMatch('loss', 8, false, false, true), null);
assert.equal(read().selectedOpponentIndex, 8);
assert.equal(read().defeatedRivals.length, 8);
assert.ok(read().unlockedPens.includes('gold_fountain'));
profileRepo.commit(draft => { draft.coins = 0; });
assert.equal(profileRepo.settleTournamentMatch('zero-balance', 8, false, false, false)?.totalCoins, 210);
assert.equal(read().coins, 210);
const savedDeviceProgress = offlineProgress(read());
profileRepo.commit(draft => { draft.coins = 0; draft.muted = true; });
assert.equal(profileRepo.restoreOfflineProgress(savedDeviceProgress), true);
assert.deepEqual(offlineProgress(read()), savedDeviceProgress);
assert.equal(read().muted, true);
const monday = Date.UTC(2026, 10, 23);
const bracket = getWeeklyTournament(monday);
assert.equal(getWeeklyTournament(monday - 1).endsAt, monday);
assert.equal(getWeeklyTournament(bracket.endsAt).week, bracket.week + 1);
assert.equal(profileRepo.settleWeeklyWin(bracket.week, 1, bracket.rivals[1], monday), 0);
const weeklyBalance = read().coins;
const ladderWinsBeforeWeekly = read().tournamentWins;
for (const [stage, rival] of bracket.rivals.entries()) {
  assert.equal(profileRepo.settleWeeklyWin(bracket.week, stage, rival, monday), WEEKLY_REWARDS[stage]);
  assert.equal(profileRepo.settleWeeklyWin(bracket.week, stage, rival, monday), 0);
}
assert.equal(read().coins, weeklyBalance + 2500);
assert.equal(read().tournamentWins, ladderWinsBeforeWeekly);
assert.equal(weeklyWins(read().weeklyTournament, bracket.week + 1), 0);
assert.equal(profileRepo.settleWeeklyWin(bracket.week, 0, bracket.rivals[0], bracket.endsAt), 0);
assert.equal(profileRepo.restoreOfflineProgress(offlineProgress(read())), true);
assert.equal(weeklyWins(read().weeklyTournament, bracket.week), 3);
const priorGuestBalance = read().coins;
const firstSlot = 'a'.repeat(64);
const secondSlot = 'b'.repeat(64);
assert.equal(switchOfflineSlot(firstSlot, null, true), true);
assert.equal(currentOfflineSlot(), firstSlot);
profileRepo.commit(draft => { draft.coins += 275; draft.lifetimeAuraEarned += 275; });
assert.equal(switchOfflineSlot('guest', null), true);
assert.equal(read().coins, priorGuestBalance);
assert.equal(switchOfflineSlot(secondSlot, { schemaVersion: 1, coins: 10 }), true);
assert.equal(read().coins, 10);
assert.equal(switchOfflineSlot(firstSlot, null), true);
assert.equal(read().coins, priorGuestBalance + 275);
assert.equal(weeklyWins(read().weeklyTournament, bracket.week), 3);
assert.equal(switchOfflineSlot('guest', null), true);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = Date.now();
const issued = Math.floor(now / 1000);
const token = (overrides: Record<string, unknown> = {}) => {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    sub: 'a', name: 'Amber', iss: 'test-issuer', aud: 'pen-fight', iat: issued - 10, exp: issued + 30, ...overrides,
  })).toString('base64url');
  const data = `${head}.${claims}`;
  return `Bearer ${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
};
const verify = createIdentityVerifier(publicKey, 'test-issuer', 'pen-fight');
const amber = verify(token(), now)!;
const blue = verify(token({ sub: 'b', name: 'Blue', rating: 9000, balance: 9999999 }), now)!;
assert.deepEqual(amber, { id: 'a', displayName: 'Amber' });
assert.equal(verify(token({ exp: issued - 1 }), now), null);
assert.equal(verify(token({ aud: 'another-app' }), now), null);
const valid = token();
const signatureStart = valid.lastIndexOf('.') + 1;
const tampered = valid.slice(0, signatureStart) + (valid[signatureStart] === 'A' ? 'B' : 'A') + valid.slice(signatureStart + 1);
assert.equal(verify(tampered, now), null);
assert.ok(eloDelta(850, 1300) > eloDelta(1300, 850));
assert.deepEqual([1000, 1150, 1400, 1700, 2050].map(getRank), ['Bronze', 'Silver', 'Gold', 'Diamond', 'Aura Legend']);
assert.equal(AURA_DIVISIONS.length, 15);
for (const [position, division] of AURA_DIVISIONS.entries()) {
  assert.equal(getAuraRank(division.minimum).label, division.label);
  if (position > 0) assert.equal(getAuraRank(division.minimum - 1).position, position - 1);
}
assert.equal(getAuraRank(1000).label, 'Bronze 1');
assert.equal(getAuraRank(1000).pointsToNext, 50);
assert.equal(getAuraRank(2600).label, 'Aura Legend 3');
assert.equal(getAuraRank(2600).next, undefined);
assert.deepEqual([0, 11_999, 12_000, 24_000, 200_000].map(rankedSearchRange), [75, 75, 150, 225, 450]);
const reconnect = new OnlineMatch(now);
reconnect.startAfterIntro(now);
const deadline = reconnect.state.deadline;
reconnect.allowReconnect(deadline, deadline - 3000);
assert.equal(reconnect.state.deadline, deadline);
reconnect.allowReconnect(deadline, deadline - 9000);
assert.equal(reconnect.state.deadline, deadline + 12_000);
reconnect.allowReconnect(deadline + 12_000, deadline - 9000);
assert.equal(reconnect.state.deadline, deadline + 12_000);
reconnect.expireTurn(deadline + 12_000);
assert.equal(reconnect.state.winner, 'p2');

const directory = mkdtempSync(join(tmpdir(), 'pen-fight-test-'));
const path = join(directory, 'competition.sqlite');
let store = new CompetitionStore(path);
try {
  store.open(amber);
  store.open(blue);
  assert.equal(store.get('b')!.balance, 0);
  assert.equal(store.get('b')!.rating, 1000);
  assert.equal(store.settleRanked('self', 'a', 'a', now, true), false);
  assert.equal(store.settleRanked('played', 'a', 'b', now, true), true);
  assert.equal(store.settleRanked('played', 'a', 'b', now, true), false);
  assert.equal(store.get('a')!.rankedWins, 1);
  assert.equal(store.get('a')!.rating, 1016);
  assert.equal(store.get('b')!.rating, 984);
  assert.equal(store.get('a')!.peakRating, 1016);
  assert.equal(store.get('b')!.peakRating, 1000);
  assert.deepEqual(store.rankedHistory('a').map(entry => [entry.before, entry.after]), [[1000, 1016]]);
  assert.deepEqual(store.rankedHistory('b').map(entry => [entry.before, entry.after]), [[1000, 984]]);
  const postMatch = store.get('a')!.lifetimeAuraEarned;
  assert.equal(store.settleRanked('forfeit', 'a', 'b', now, false), true);
  assert.equal(store.get('a')!.lifetimeAuraEarned, postMatch);
  assert.equal(store.get('a')!.rating, 1016);
  assert.ok(store.get('b')!.rating < 984);
  assert.equal(store.settleRanked('third', 'a', 'b', now, true), true);
  assert.equal(store.rankPairEligible('b', 'a', now), false);
  assert.equal(store.settleRanked('farm', 'a', 'b', now, true), false);
  assert.equal(store.rankPairEligible('b', 'a', now + 86_400_001), true);
  assert.equal(store.settleTournament('skip', 'a', 7, true, now), false);
  for (let index = 0; index < 8; index++) assert.equal(store.settleTournament(`rival-${index}`, 'a', index, true, now), true);
  assert.equal(store.settleTournament('rival-7', 'a', 7, true, now), false);
  const earned = store.get('a')!.lifetimeAuraEarned;
  assert.equal(store.buy('a', 'chunky_marker'), false);
  assert.equal(store.buy('a', 'hyper_gel'), true);
  assert.equal(store.buy('a', 'hyper_gel'), false);
  assert.equal(store.get('a')!.balance, earned - 20_000);
  assert.equal(store.get('a')!.lifetimeAuraEarned, earned);
  assert.equal(store.settleTournament('verified-loss', 'a', 8, false, now), true);
  assert.equal(store.get('a')!.balance, earned - 20_000 + 210);
  assert.equal(store.get('a')!.lifetimeAuraEarned, earned + 210);
  assert.equal(store.rankedResult('played', 'a')?.before, 1000);
  const session = store.createAccountSession(amber, now);
  assert.deepEqual(store.accountIdentity(`Bearer ${session}`, now), amber);
  assert.equal(store.accountIdentity(`Bearer ${session}`, now + 7 * 86_400_000), null);
  store.revokeAccountSession(`Bearer ${session}`);
  assert.equal(store.accountIdentity(`Bearer ${session}`, now), null);
  store.open({ id: 'idle', displayName: 'No completed games' });
  assert.equal(store.leaderboard('ranked').length, 2);
  assert.equal(store.leaderboard('ranked')[0]?.displayName, 'Amber');
  assert.equal(store.leaderboard('tournament')[0]?.completed, 8);
  assert.ok(store.leaderboard('tournament')[0]?.achievements.includes('Eight Rivals Down'));
  assert.equal(store.leaderboard('wealth')[0]?.lifetimeAuraEarned, earned + 210);
  store.close();
  store = new CompetitionStore(path);
  assert.equal(store.get('a')!.lifetimeAuraEarned, earned + 210);
  assert.equal(store.settleRanked('played', 'a', 'b', now + 86_400_001, true), false);
  console.log('Legacy saves, exact pricing, one-time achievements and ad rewards, signed identities, Elo, rematch caps, all three boards and durable settlement verified.');
} finally {
  store.close();
  unlinkSync(path);
  rmdirSync(directory);
}

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: {
    ...process.env, HOST: '127.0.0.1', PORT: '0', COMPETITION_DB_PATH: ':memory:',
    COMPETITION_ISSUER: 'test-issuer', COMPETITION_AUDIENCE: 'pen-fight',
    COMPETITION_IDENTITY_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const stopped = once(server, 'exit');
try {
  const [ready] = await once(server.stdout, 'data', { signal: AbortSignal.timeout(8000) });
  const port = ready.toString().match(/listening on 127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(port, ready.toString());
  const api = (path: string, authorization?: string, body?: unknown, method = body ? 'POST' : 'GET') =>
    fetch(`http://127.0.0.1:${port}/api/online/${path}`, {
      method, signal: AbortSignal.timeout(5000),
      headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const join = async (body: unknown, authorization?: string) => {
    const response = await api('join', authorization, body);
    assert.equal(response.status, 201);
    return `Bearer ${(await response.json()).token}`;
  };
  assert.equal((await api('join', undefined, { mode: 'ranked', winner: 'p1' })).status, 401);
  const guest = await join({});
  const player1 = await join({ mode: 'ranked', balance: 621000 }, token());
  const player2 = await join({ mode: 'ranked' }, token({ sub: 'b', name: 'Blue' }));
  assert.equal((await (await api('state', guest)).json()).status, 'waiting');
  const firstState = await (await api('state', player1)).json();
  const secondState = await (await api('state', player2)).json();
  assert.equal(firstState.side, 'p1');
  assert.equal(secondState.side, 'p2');
  assert.deepEqual(firstState.state, secondState.state);
  assert.deepEqual(firstState.ranked.players, secondState.ranked.players);
  assert.equal(firstState.ranked.players.p2.displayName, 'Blue');
  const shot = { revision: 0, flick: { aimRadians: -Math.PI / 2, gripOffset01: 0, normalizedPower: 0.25 } };
  assert.equal((await api('flick', player1, shot)).status, 409);
  await wait(Math.max(0, firstState.ranked.startsAt - Date.now()) + 60);
  assert.equal((await api('flick', player2, shot)).status, 409);
  assert.equal((await api('flick', player1, { ...shot, winner: 'p1', score: { p1: 2, p2: 0 } })).status, 204);
  assert.equal((await api('flick', player1, shot)).status, 409);
  assert.equal((await api('session', player2, undefined, 'DELETE')).status, 204);
  const account = await (await api('competition/profile', token())).json();
  assert.equal(account.balance, 0);
  assert.equal(account.rankedWins, 0);
  const backupPath = 'competition/offline-backup';
  const offlineProgress = { schemaVersion: 1, coins: 2600, penGripLevels: { classic_ballpoint: 2 },
    claimedRewardIds: Array.from({ length: 120 }, (_, i) => `tournament-reward-${i}`) };
  assert.equal((await api(backupPath)).status, 401);
  const before = await (await api(backupPath, token())).json();
  assert.equal(before.backup, null);
  assert.match(before.slot, /^[a-f0-9]{64}$/);
  assert.equal((await api(backupPath, token(), { version: 0, progress: offlineProgress }, 'PUT')).status, 200);
  assert.equal((await api(backupPath, token(), { version: 0, progress: offlineProgress }, 'PUT')).status, 409);
  const restored = await (await api(backupPath, token())).json();
  assert.deepEqual(restored.backup, { version: 1, progress: offlineProgress });
  const other = await (await api(backupPath, token({ sub: 'b', name: 'Blue' }))).json();
  assert.equal(other.backup, null);
  assert.notEqual(other.slot, before.slot);
  assert.equal((await (await api('competition/profile', token())).json()).balance, 0);
  assert.deepEqual((await (await api('leaderboards/ranked')).json()).rows, []);
  const active1 = await join({ mode: 'ranked' }, token());
  const active2 = await join({ mode: 'ranked' }, token({ sub: 'b', name: 'Blue' }));
  const matched = await (await api('state', active1)).json();
  await wait(Math.max(0, matched.ranked.startsAt - Date.now()) + 60);
  assert.equal((await api('flick', active1, shot)).status, 204);
  const firstShot = await (await api('state', active2)).json();
  await wait(Math.max(0, firstShot.replay.endAt - Date.now()) + 60);
  assert.equal((await api('flick', active2, { ...shot, revision: firstShot.state.revision })).status, 204);
  const concession = await api('session', active2, undefined, 'DELETE');
  assert.equal(concession.status, 200);
  const conceded = (await concession.json()).result;
  assert.equal(conceded.before - conceded.after, 16);
  assert.equal(conceded.completed, false);
  const survivor = (await (await api('state', active1)).json()).ranked.result;
  assert.equal(survivor.after, survivor.before);
  assert.equal(survivor.won, true);
  const opponentProfile = await (await api('competition/profile', token({ sub: 'b', name: 'Blue' }))).json();
  assert.equal(opponentProfile.rating, 984);
  assert.equal(opponentProfile.history.length, 1);
  assert.equal((await api('join', token(), { mode: 'verified_tournament', rival: 7 })).status, 403);
  assert.ok(await join({ mode: 'verified_tournament', rival: 0 }, token()));
  console.log('HTTP guest isolation, verified join, match snapshots, forfeit rating receipts and rejection of client results verified.');
} finally {
  server.kill();
  await stopped;
}

const oauthStore = new CompetitionStore(':memory:');
const oauth = express();
oauth.use(express.json());
const googleCalls: string[] = [];
const supabaseRedirect = 'http://localhost/api/online/auth/google/callback';
let supabaseChallenge = '';
oauth.use('/supabase', createRankedAuth(oauthStore, {
  provider: 'supabase', projectUrl: 'https://fixture.supabase.co',
  publishableKey: 'fixture-publishable', redirectUri: supabaseRedirect,
}, async (input, init) => {
  assert.equal(String(input), 'https://fixture.supabase.co/auth/v1/token?grant_type=pkce');
  assert.equal(new Headers(init?.headers).get('apikey'), 'fixture-publishable');
  const body = JSON.parse(String(init?.body));
  if (body.auth_code !== 'valid-code' ||
    createHash('sha256').update(body.code_verifier).digest('base64url') !== supabaseChallenge) {
    return Response.json({}, { status: 400 });
  }
  return Response.json({ user: {
    user_metadata: { sub: 'untrusted' },
    identities: [{ provider: 'google', identity_data: { sub: '10931234' } }],
  } });
}));
oauth.use('/api/online', createRankedAuth(oauthStore, {
  clientId: 'fixture-client', clientSecret: 'fixture-secret', redirectUri: 'http://localhost/api/online/auth/google/callback',
}, async (input, init) => {
  googleCalls.push(String(input));
  if (String(input) === 'https://oauth2.googleapis.com/token') {
    assert.ok(init?.body instanceof URLSearchParams);
    assert.equal(init.body.get('code'), 'test-code');
    assert.ok(init.body.get('code_verifier'));
    return Response.json({ access_token: 'fixture-token' });
  }
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-token');
  return Response.json({ sub: '10931234' });
}));
const authServer = oauth.listen(0, '127.0.0.1');
try {
  await once(authServer, 'listening');
  const address = authServer.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/online/auth`;
  const post = (path: string, body: object) => fetch(`${base}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const { check, url } = await (await post('google', { displayName: 'Ink Pilot' })).json();
  assert.equal((await post('google/check', { check })).status, 202);
  const redirect = await fetch(base + '/google/start/' + new URL(url).pathname.split('/').at(-1), { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  const google = new URL(redirect.headers.get('location')!);
  assert.equal(google.hostname, 'accounts.google.com');
  assert.equal(google.searchParams.get('scope'), 'openid');
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
  const callback = base + '/google/callback?code=test-code&state=' + google.searchParams.get('state');
  assert.equal((await fetch(callback)).status, 410);
  const cookie = redirect.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await fetch(callback, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(callback, { headers: { Cookie: cookie } })).status, 410);
  const accountResponse = await post('google/check', { check });
  assert.equal(accountResponse.status, 200);
  const { token: accountToken } = await accountResponse.json();
  assert.deepEqual(oauthStore.accountIdentity(`Bearer ${accountToken}`), { id: 'google:10931234', displayName: 'Ink Pilot' });
  assert.equal((await post('google/check', { check })).status, 410);
  assert.equal(googleCalls.length, 2);
  const supabaseBase = `http://127.0.0.1:${address.port}/supabase/auth/google`;
  const request = (path: string, body: object) => fetch(supabaseBase + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const attempt = await (await request('', { displayName: 'Ink Pilot', returnToApp: true })).json();
  const start = await fetch(supabaseBase + '/start/' + new URL(attempt.url).pathname.split('/').at(-1), { redirect: 'manual' });
  const provider = new URL(start.headers.get('location')!);
  assert.equal(provider.origin, 'https://fixture.supabase.co');
  assert.equal(provider.pathname, '/auth/v1/authorize');
  assert.equal(provider.searchParams.get('provider'), 'google');
  assert.equal(provider.searchParams.get('redirect_to'), supabaseRedirect);
  assert.equal(provider.searchParams.get('code_challenge_method'), 's256');
  supabaseChallenge = provider.searchParams.get('code_challenge')!;
  const supabaseReturn = supabaseBase + '/callback?code=valid-code';
  assert.equal((await fetch(supabaseReturn)).status, 410);
  const browserCookie = start.headers.get('set-cookie')!.split(';')[0];
  const completed = await fetch(supabaseReturn, { headers: { Cookie: browserCookie } });
  assert.equal(completed.status, 200);
  const page = await completed.text();
  assert.match(page, /Return to game/);
  assert.match(page, /scheme=penfightaurawars;package=com\.penfightroyale\.game/);
  assert.doesNotMatch(page, /valid-code/);
  assert.equal((await fetch(supabaseReturn, { headers: { Cookie: browserCookie } })).status, 410);
  const supabaseSession = await (await request('/check', { check: attempt.check })).json();
  assert.deepEqual(oauthStore.accountIdentity(`Bearer ${supabaseSession.token}`),
    { id: 'google:10931234', displayName: 'Ink Pilot' });
  const retried = await (await request('/check', { check: attempt.check })).json();
  assert.equal(retried.token, supabaseSession.token);
  async function accountAttempt(details: object) {
    const pending = await (await request('', details)).json();
    const launch = await fetch(supabaseBase + '/start/' + new URL(pending.url).pathname.split('/').at(-1),
      { redirect: 'manual' });
    supabaseChallenge = new URL(launch.headers.get('location')!).searchParams.get('code_challenge')!;
    const cookie = launch.headers.get('set-cookie')!.split(';')[0];
    const returned = await fetch(supabaseReturn, { headers: { Cookie: cookie } });
    assert.equal(returned.status, 200);
    const response = await request('/check', { check: pending.check });
    assert.equal(response.status, 200);
    return (await response.json()).token as string;
  }
  await accountAttempt({ mode: 'signup', fullName: 'Alex Doe', displayName: 'InkAce' });
  oauthStore.putOfflineBackup('google:10931234', 0, { schemaVersion: 1, coins: 1500 });
  const restoredToken = await accountAttempt({ mode: 'signin' });
  assert.equal(oauthStore.accountIdentity(`Bearer ${restoredToken}`)?.displayName, 'InkAce');
  assert.equal(oauthStore.get('google:10931234')?.fullName, 'Alex Doe');
  assert.equal(oauthStore.get('google:10931234')?.username, 'InkAce');
  assert.equal(oauthStore.getOfflineBackup('google:10931234')?.progress.coins, 1500);
  await accountAttempt({ mode: 'legacy', displayName: 'Different Name' });
  assert.equal(oauthStore.get('google:10931234')?.displayName, 'InkAce');
  console.log('15 divisions, ranked receipts, direct Google and Supabase Auth handoffs verified with test providers.');
} finally {
  authServer.close();
  oauthStore.close();
}
