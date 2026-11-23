import { createHash, randomBytes, verify, type KeyObject } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PENS, TOURNAMENT_LADDER } from './rankedGame/content';
import { calculateTournamentReward, getTournamentAchievements } from './rankedGame/progression';
import { getAuraRank, STARTING_RATING, type RankedHistoryEntry } from './rankedGame/ranking';

export type Leaderboard = 'ranked' | 'tournament' | 'wealth';
export interface OfflineBackup { version: number; progress: Record<string, unknown> }
export interface Identity { id: string; displayName: string }
export interface CompetitiveProfile extends Identity {
  rating: number;
  peakRating: number;
  rankedWins: number;
  rankedMatches: number;
  streak: number;
  bestStreak: number;
  defeated: number[];
  bossClears: number;
  balance: number;
  lifetimeAuraEarned: number;
  equippedPen: string;
  ownedPens: string[];
}

export function getRank(rating: number): string {
  return getAuraRank(rating).tier;
}

export function eloDelta(winner: number, loser: number): number {
  const expected = 1 / (1 + 10 ** ((loser - winner) / 400));
  return Math.max(1, Math.round(32 * (1 - expected)));
}

export function newCompetitor(identity: Identity): CompetitiveProfile {
  return {
    ...identity, rating: STARTING_RATING, peakRating: STARTING_RATING,
    rankedWins: 0, rankedMatches: 0, streak: 0, bestStreak: 0,
    defeated: [], bossClears: 0, balance: 0, lifetimeAuraEarned: 0,
    equippedPen: 'classic_ballpoint', ownedPens: ['classic_ballpoint'],
  };
}

function award(player: CompetitiveProfile, points: number) {
  player.balance += points;
  player.lifetimeAuraEarned += points;
}

export function applyRankedResult(winner: CompetitiveProfile, loser: CompetitiveProfile, matchId: string, now: number, completed: boolean) {
  const change = eloDelta(winner.rating, loser.rating);
  const winnerBefore = winner.rating;
  const loserBefore = loser.rating;
  loser.rating = Math.max(100, loser.rating - change);
  loser.rankedMatches++;
  loser.streak = 0;
  if (completed) {
    winner.rating += change;
    winner.peakRating = Math.max(winner.peakRating, winner.rating);
    winner.rankedMatches++;
    winner.rankedWins++;
    winner.bestStreak = Math.max(winner.bestStreak, ++winner.streak);
    award(winner, 1_400 + Math.min(450, change * 12));
    award(loser, 260);
    if ([25, 100, 250].includes(winner.rankedWins)) award(winner, winner.rankedWins * 180);
  }
  const winnerEntry: RankedHistoryEntry = {
    id: matchId, at: now, won: true, completed, opponent: loser.displayName,
    opponentRating: loserBefore, before: winnerBefore, after: winner.rating,
  };
  const loserEntry: RankedHistoryEntry = {
    id: matchId, at: now, won: false, completed, opponent: winner.displayName,
    opponentRating: winnerBefore, before: loserBefore, after: loser.rating,
  };
  return { winnerEntry, loserEntry };
}

export function rivalAvailable(player: CompetitiveProfile | undefined, index: number) {
  return !!player && Number.isInteger(index) && !!TOURNAMENT_LADDER[index]
    && (index === 0 || player.defeated.includes(index - 1));
}

export function applyTournamentResult(player: CompetitiveProfile, index: number, won: boolean) {
  const rival = TOURNAMENT_LADDER[index];
  const reward = calculateTournamentReward({
    defeatedRivals: player.defeated, unlockedPens: player.ownedPens, dailyDoubleDay: '', dailyDoubleCount: 0,
  }, rival, won, false, false, '');
  if (rival.isBoss && reward.nextRivals.length > player.defeated.length) player.bossClears++;
  player.defeated = reward.nextRivals;
  award(player, reward.totalCoins);
}

export function applyPurchase(player: CompetitiveProfile | undefined, penId: string) {
  const pen = PENS.find(item => item.id === penId);
  if (!player || !pen || player.balance < pen.unlockCoins || player.ownedPens.includes(penId)) return false;
  const eligible = penId === 'chunky_marker' ? player.rankedWins >= 25
    : penId === 'vortex_spinner' ? player.rankedWins >= 100 && player.bestStreak >= 10
    : penId === 'gold_fountain' ? getRank(player.rating) === 'Aura Legend' && player.rankedWins >= 250
    : player.defeated.filter(index => index < 16).length >= pen.requiredTournamentWins;
  if (!eligible) return false;
  player.balance -= pen.unlockCoins;
  player.equippedPen = penId;
  player.ownedPens.push(penId);
  return true;
}

export function publicRank(player: CompetitiveProfile) {
  return {
    displayName: player.displayName, rank: getAuraRank(player.rating).label, rating: player.rating,
    equippedPen: player.equippedPen, completed: player.defeated.length,
    bossClears: player.bossClears, lifetimeAuraEarned: player.lifetimeAuraEarned,
    achievements: getTournamentAchievements(player.defeated, player.ownedPens.includes('gold_fountain'))
      .filter(achievement => achievement.earned).map(achievement => achievement.title),
  };
}

export function createIdentityVerifier(key: KeyObject, issuer: string, audience: string) {
  return (authorization: string | undefined, now = Date.now()): Identity | null => {
    const encoded = authorization?.match(/^Bearer ([\w.-]+)$/)?.[1];
    if (!encoded || encoded.length > 8192) return null;
    const segments = encoded.split('.');
    if (segments.length !== 3 || segments.some(segment => !/^[\w-]+$/.test(segment))) return null;
    const [head, body, signature] = segments;
    try {
      const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
      if (header.alg !== 'RS256' || !verify('RSA-SHA256', Buffer.from(`${head}.${body}`), key,
        Buffer.from(signature, 'base64url'))) return null;
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      const seconds = Math.floor(now / 1000);
      if (claims.iss !== issuer || claims.aud !== audience || !Number.isSafeInteger(claims.exp)
        || claims.exp <= seconds || !Number.isSafeInteger(claims.iat) || claims.iat > seconds + 30
        || claims.exp <= claims.iat || claims.exp - claims.iat > 3600
        || (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > seconds))
        || typeof claims.sub !== 'string' || !/^[\w:@.-]{1,150}$/.test(claims.sub)) return null;
      const name = typeof claims.name === 'string'
        ? [...claims.name.replace(/\p{C}/gu, '').trim()].slice(0, 28).join('') : '';
      return { id: claims.sub, displayName: name || 'Pen Fighter' };
    } catch {
      return null;
    }
  };
}

export class CompetitionStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS competitors (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settled (
        id TEXT PRIMARY KEY, mode TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, finished INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS settled_pair ON settled(mode, a, b, finished);
      CREATE TABLE IF NOT EXISTS offline_backups (
        account_id TEXT PRIMARY KEY, version INTEGER NOT NULL, progress TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ranked_history (
        match_id TEXT NOT NULL, account_id TEXT NOT NULL, finished INTEGER NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (match_id, account_id)
      );
      CREATE INDEX IF NOT EXISTS history_account ON ranked_history(account_id, finished DESC);
      CREATE TABLE IF NOT EXISTS account_sessions (
        token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires INTEGER NOT NULL
      );
    `);
  }

  close() { this.db.close(); }

  getOfflineBackup(accountId: string): OfflineBackup | null {
    const row = this.db.prepare('SELECT version, progress FROM offline_backups WHERE account_id = ?').get(accountId);
    return row ? { version: Number(row.version), progress: JSON.parse(String(row.progress)) } : null;
  }

  putOfflineBackup(accountId: string, version: number, progress: OfflineBackup['progress']): boolean {
    const contents = JSON.stringify(progress);
    return version === 0
      ? !!this.db.prepare('INSERT INTO offline_backups VALUES (?, 1, ?) ON CONFLICT DO NOTHING').run(accountId, contents).changes
      : !!this.db.prepare('UPDATE offline_backups SET version = version + 1, progress = ? WHERE account_id = ? AND version = ?')
        .run(contents, accountId, version).changes;
  }

  get(id: string): CompetitiveProfile | undefined {
    const row = this.db.prepare('SELECT data FROM competitors WHERE id = ?').get(id);
    if (!row) return undefined;
    const profile = JSON.parse(String(row.data)) as CompetitiveProfile;
    profile.peakRating ??= Math.max(STARTING_RATING, profile.rating);
    return profile;
  }

  private put(profile: CompetitiveProfile) {
    this.db.prepare('INSERT INTO competitors (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(profile.id, JSON.stringify(profile));
  }

  open(identity: Identity): CompetitiveProfile {
    const existing = this.get(identity.id);
    if (existing) {
      if (existing.displayName !== identity.displayName) {
        existing.displayName = identity.displayName;
        this.put(existing);
      }
      return existing;
    }
    const player = newCompetitor(identity);
    this.put(player);
    return player;
  }

  rankPairEligible(first: string, second: string, now: number): boolean {
    if (first === second) return false;
    const [a, b] = [first, second].sort();
    const row = this.db.prepare("SELECT count(*) AS count FROM settled WHERE mode = 'ranked' AND a = ? AND b = ? AND finished >= ?")
      .get(a, b, now - 86_400_000);
    return Number(row?.count) < 3;
  }

  private once(id: string, mode: string, a: string, b: string, now: number, apply: () => void): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const saved = this.db.prepare('INSERT OR IGNORE INTO settled (id, mode, a, b, finished) VALUES (?, ?, ?, ?, ?)')
        .run(id, mode, a, b, now).changes;
      if (saved) apply();
      this.db.exec('COMMIT');
      return !!saved;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  settleRanked(matchId: string, winnerId: string, loserId: string, now: number, completed: boolean): boolean {
    if (!this.rankPairEligible(winnerId, loserId, now)) return false;
    const winner = this.get(winnerId), loser = this.get(loserId);
    if (!winner || !loser) return false;
    const [a, b] = [winnerId, loserId].sort();
    return this.once(matchId, 'ranked', a, b, now, () => {
      const { winnerEntry, loserEntry } = applyRankedResult(winner, loser, matchId, now, completed);
      this.put(winner);
      this.put(loser);
      const insert = this.db.prepare('INSERT INTO ranked_history VALUES (?, ?, ?, ?)');
            insert.run(matchId, winnerId, now, JSON.stringify(winnerEntry));
      insert.run(matchId, loserId, now, JSON.stringify(loserEntry));
    });
  }

  rankedHistory(accountId: string): RankedHistoryEntry[] {
    return this.db.prepare('SELECT data FROM ranked_history WHERE account_id = ? ORDER BY finished DESC, rowid DESC LIMIT 20')
      .all(accountId).map(row => JSON.parse(String(row.data)) as RankedHistoryEntry);
  }

  rankedResult(matchId: string, accountId: string): RankedHistoryEntry | undefined {
    const row = this.db.prepare('SELECT data FROM ranked_history WHERE match_id = ? AND account_id = ?').get(matchId, accountId);
    return row && JSON.parse(String(row.data)) as RankedHistoryEntry;
  }

  createAccountSession(identity: Identity, now: number): string {
    this.open(identity);
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM account_sessions WHERE expires <= ?').run(now);
    this.db.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').run(
      createHash('sha256').update(token).digest('hex'), identity.id, now + 7 * 86_400_000);
    return token;
  }

  accountIdentity(authorization: string | undefined, now = Date.now()): Identity | null {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) return null;
    const row = this.db.prepare('SELECT account_id FROM account_sessions WHERE token_hash = ? AND expires > ?')
      .get(createHash('sha256').update(token).digest('hex'), now);
    const player = row && this.get(String(row.account_id));
    return player ? { id: player.id, displayName: player.displayName } : null;
  }

  revokeAccountSession(authorization: string | undefined): void {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (token) this.db.prepare('DELETE FROM account_sessions WHERE token_hash = ?')
      .run(createHash('sha256').update(token).digest('hex'));
  }

  canFightRival(id: string, index: number): boolean {
    return rivalAvailable(this.get(id), index);
  }

  settleTournament(matchId: string, id: string, index: number, won: boolean, now: number): boolean {
    const player = this.get(id);
    if (!player || !rivalAvailable(player, index)) return false;
    return this.once(matchId, 'tournament', id, String(index), now, () => {
      applyTournamentResult(player, index, won);
      this.put(player);
    });
  }

  buy(id: string, penId: string): boolean {
    const player = this.get(id);
    if (!player || !applyPurchase(player, penId)) return false;
    this.put(player);
    return true;
  }

    leaderboard(board: Leaderboard) {
    const ranked = "json_extract(data, '$.rankedMatches')";
    const clears = "json_array_length(data, '$.defeated')";
    const lifetime = "json_extract(data, '$.lifetimeAuraEarned')";
    const filter = { ranked, tournament: clears, wealth: lifetime }[board];
    const order = {
      ranked: "json_extract(data, '$.rating')",
      tournament: `json_extract(data, '$.bossClears') * 100 + ${clears}`,
      wealth: lifetime,
    }[board];
    return this.db.prepare(`SELECT data FROM competitors WHERE ${filter} > 0
      ORDER BY ${order} DESC, json_extract(data, '$.rankedWins') DESC, id LIMIT 50`).all()
      .map(row => JSON.parse(String(row.data)) as CompetitiveProfile)
      .map(publicRank);
  }
}
