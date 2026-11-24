import { createPublicKey } from 'node:crypto';
import { CompetitionStore, createIdentityVerifier } from './competition';
import { PostgresCompetitionStore } from './competitionPostgres';
import type { RankedAuthConfig } from './rankedAuth';

export function loadCompetition() {
  const env = process.env;
  const connection = env.COMPETITION_DATABASE_URL;
  const ca = env.COMPETITION_DATABASE_CA?.replace(/\\n/g, '\n');
  const sqlite = env.COMPETITION_DB_PATH;
  const redirectUri = env.GOOGLE_RANKED_REDIRECT_URI;
  const auth: RankedAuthConfig | undefined = redirectUri && env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
    ? { provider: 'supabase', projectUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY, redirectUri }
    : redirectUri && env.GOOGLE_RANKED_CLIENT_ID && env.GOOGLE_RANKED_CLIENT_SECRET
      ? { clientId: env.GOOGLE_RANKED_CLIENT_ID, clientSecret: env.GOOGLE_RANKED_CLIENT_SECRET, redirectUri }
      : undefined;
  const external = env.COMPETITION_IDENTITY_PUBLIC_KEY && env.COMPETITION_ISSUER && env.COMPETITION_AUDIENCE
    ? createIdentityVerifier(createPublicKey(env.COMPETITION_IDENTITY_PUBLIC_KEY.replace(/\\n/g, '\n')),
      env.COMPETITION_ISSUER, env.COMPETITION_AUDIENCE)
    : undefined;
  if (!auth && !external) return undefined;
  const store = connection && ca ? new PostgresCompetitionStore(connection, ca)
    : !connection && sqlite ? new CompetitionStore(sqlite) : undefined;
  if (!store) return undefined;
  return {
    store, auth,
    ready: () => store instanceof PostgresCompetitionStore ? store.ready() : Promise.resolve(),
    verifyIdentity: async (authorization: string | undefined) =>
      await store.accountIdentity(authorization) ?? external?.(authorization) ?? null,
  };
}
