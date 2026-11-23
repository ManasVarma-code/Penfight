BEGIN;
CREATE SCHEMA IF NOT EXISTS pen_fight_ranked;
REVOKE ALL ON SCHEMA pen_fight_ranked FROM PUBLIC;
CREATE TABLE IF NOT EXISTS pen_fight_ranked.competitors (
  id text PRIMARY KEY, data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS pen_fight_ranked.settled (
  id text PRIMARY KEY, mode text NOT NULL, a text NOT NULL, b text NOT NULL, finished bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS settled_pair ON pen_fight_ranked.settled(mode, a, b, finished);
CREATE TABLE IF NOT EXISTS pen_fight_ranked.ranked_history (
  match_id text NOT NULL, account_id text NOT NULL, finished bigint NOT NULL, data jsonb NOT NULL,
  PRIMARY KEY (match_id, account_id)
);
CREATE INDEX IF NOT EXISTS history_account ON pen_fight_ranked.ranked_history(account_id, finished DESC);
CREATE TABLE IF NOT EXISTS pen_fight_ranked.account_sessions (
  token_hash text PRIMARY KEY, account_id text NOT NULL, expires bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_expiry ON pen_fight_ranked.account_sessions(expires);
REVOKE ALL ON ALL TABLES IN SCHEMA pen_fight_ranked FROM PUBLIC;
COMMIT;
