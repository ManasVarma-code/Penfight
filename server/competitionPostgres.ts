import { createHash, randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { RankedHistoryEntry } from './rankedGame/ranking';
import {
  applyPurchase, applyRankedResult, applyTournamentResult, newCompetitor, publicRank, rivalAvailable,
  type CompetitiveProfile, type Identity, type Leaderboard,
} from './competition';

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const accountToken = (authorization: string | undefined) => authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
const schema = 'pen_fight_ranked';

export class PostgresCompetitionStore {
  private readonly pool: Pool;

  constructor(connection: string, ca: string) {
    const url = new URL(connection);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash || !ca.includes('BEGIN CERTIFICATE')) {
      throw new Error('Ranked Postgres requires a connection URL without query parameters and an explicit TLS CA.');
    }
    this.pool = new Pool({
      connectionString: connection, ssl: { ca, rejectUnauthorized: true },
      max: 4, connectionTimeoutMillis: 3000, statement_timeout: 4000, idleTimeoutMillis: 10000,
    });
    this.pool.on('error', () => console.error('Ranked database idle connection failed.'));
  }

  async ready() {
    await this.pool.query(`SELECT 1 FROM ${schema}.competitors LIMIT 1`);
  }

  async close() { await this.pool.end(); }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async lock(client: PoolClient, ...ids: string[]) {
    const { rows } = await client.query<{ data: CompetitiveProfile }>(
      `SELECT data FROM ${schema}.competitors WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`, [ids]);
    return rows.map(row => row.data);
  }

  private async put(client: PoolClient, player: CompetitiveProfile) {
    await client.query(`UPDATE ${schema}.competitors SET data = $2 WHERE id = $1`, [player.id, player]);
  }

  async get(id: string): Promise<CompetitiveProfile | undefined> {
    const { rows } = await this.pool.query<{ data: CompetitiveProfile }>(
      `SELECT data FROM ${schema}.competitors WHERE id = $1`, [id]);
    return rows[0]?.data;
  }

  async open(identity: Identity, database: Pool | PoolClient = this.pool): Promise<CompetitiveProfile> {
    const current = await database.query<{ data: CompetitiveProfile }>(
      `SELECT data FROM ${schema}.competitors WHERE id = $1`, [identity.id]);
    if (current.rows[0]?.data.displayName === identity.displayName) return current.rows[0].data;
    const { rows } = await database.query<{ data: CompetitiveProfile }>(
      `INSERT INTO ${schema}.competitors (id, data) VALUES ($1, $2)
       ON CONFLICT(id) DO UPDATE SET data = jsonb_set(competitors.data, '{displayName}', to_jsonb($3::text))
       RETURNING data`, [identity.id, newCompetitor(identity), identity.displayName]);
    return rows[0].data;
  }

  async rankPairEligible(first: string, second: string, now: number, database: Pool | PoolClient = this.pool) {
    if (first === second) return false;
    const [a, b] = [first, second].sort();
    const { rows } = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${schema}.settled WHERE mode = 'ranked' AND a = $1 AND b = $2 AND finished >= $3`,
      [a, b, now - 86_400_000]);
    return rows[0].count < 3;
  }

  private async settle(client: PoolClient, id: string, mode: string, a: string, b: string, now: number) {
    const result = await client.query(
      `INSERT INTO ${schema}.settled VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`, [id, mode, a, b, now]);
    return !!result.rowCount;
  }

  async settleRanked(matchId: string, winnerId: string, loserId: string, now: number, completed: boolean) {
    if (winnerId === loserId) return false;
    return this.transaction(async client => {
      const players = await this.lock(client, winnerId, loserId);
      const winner = players.find(player => player.id === winnerId);
      const loser = players.find(player => player.id === loserId);
      if (!winner || !loser || !(await this.rankPairEligible(winnerId, loserId, now, client))) return false;
      const [a, b] = [winnerId, loserId].sort();
      if (!(await this.settle(client, matchId, 'ranked', a, b, now))) return false;
      const { winnerEntry, loserEntry } = applyRankedResult(winner, loser, matchId, now, completed);
      await this.put(client, winner);
      await this.put(client, loser);
      await client.query(`INSERT INTO ${schema}.ranked_history VALUES ($1, $2, $4, $5), ($1, $3, $4, $6)`,
        [matchId, winnerId, loserId, now, winnerEntry, loserEntry]);
      return true;
    });
  }

  async rankedHistory(id: string): Promise<RankedHistoryEntry[]> {
    const { rows } = await this.pool.query<{ data: RankedHistoryEntry }>(
      `SELECT data FROM ${schema}.ranked_history WHERE account_id = $1 ORDER BY finished DESC, match_id LIMIT 20`, [id]);
    return rows.map(row => row.data);
  }

  async rankedResult(matchId: string, accountId: string): Promise<RankedHistoryEntry | undefined> {
    const { rows } = await this.pool.query<{ data: RankedHistoryEntry }>(
      `SELECT data FROM ${schema}.ranked_history WHERE match_id = $1 AND account_id = $2`, [matchId, accountId]);
    return rows[0]?.data;
  }

  async createAccountSession(identity: Identity, now: number) {
    const token = randomBytes(32).toString('base64url');
    await this.transaction(async client => {
      await this.open(identity, client);
      await client.query(`DELETE FROM ${schema}.account_sessions WHERE expires <= $1`, [now]);
      await client.query(`INSERT INTO ${schema}.account_sessions VALUES ($1, $2, $3)`,
        [tokenHash(token), identity.id, now + 7 * 86_400_000]);
    });
    return token;
  }

  async accountIdentity(authorization: string | undefined, now = Date.now()): Promise<Identity | null> {
    const token = accountToken(authorization);
    if (!token) return null;
    const { rows } = await this.pool.query<{ id: string; displayName: string }>(
      `SELECT p.id, p.data->>'displayName' AS "displayName" FROM ${schema}.account_sessions s
       JOIN ${schema}.competitors p ON s.account_id = p.id WHERE token_hash = $1 AND expires > $2`, [tokenHash(token), now]);
    return rows[0] ?? null;
  }

  async revokeAccountSession(authorization: string | undefined) {
    const token = accountToken(authorization);
    if (token) await this.pool.query(`DELETE FROM ${schema}.account_sessions WHERE token_hash = $1`, [tokenHash(token)]);
  }

  async canFightRival(id: string, index: number) { return rivalAvailable(await this.get(id), index); }

  async settleTournament(matchId: string, id: string, index: number, won: boolean, now: number) {
    return this.transaction(async client => {
      const [player] = await this.lock(client, id);
      if (!rivalAvailable(player, index) || !(await this.settle(client, matchId, 'tournament', id, String(index), now))) return false;
      applyTournamentResult(player, index, won);
      await this.put(client, player);
      return true;
    });
  }

  async buy(id: string, penId: string) {
    return this.transaction(async client => {
      const [player] = await this.lock(client, id);
      if (!applyPurchase(player, penId)) return false;
      await this.put(client, player);
      return true;
    });
  }

  async leaderboard(board: Leaderboard) {
    const ranked = "(data->>'rankedMatches')::int";
    const clears = "jsonb_array_length(data->'defeated')";
    const lifetime = "(data->>'lifetimeAuraEarned')::bigint";
    const filter = { ranked, tournament: clears, wealth: lifetime }[board];
    const order = { ranked: "(data->>'rating')::int", tournament: `(data->>'bossClears')::int * 100 + ${clears}`, wealth: lifetime }[board];
    const { rows } = await this.pool.query<{ data: CompetitiveProfile }>(
      `SELECT data FROM ${schema}.competitors WHERE ${filter} > 0
       ORDER BY ${order} DESC, (data->>'rankedWins')::int DESC, id LIMIT 50`);
    return rows.map(row => publicRank(row.data));
  }
}
