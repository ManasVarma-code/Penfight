# Verified competition rollout

Offline Tournament and Pass & Play use the existing device profile. Guest 1v1 uses the existing server-authoritative match service. Both remain available without an account.

## Test Google sign-in locally

1. In the Supabase project, open **Authentication → Sign In / Providers → Google**. Supabase displays the callback URL to register on your Google **Web application** OAuth client. Enter the Google client ID and secret in the Supabase provider settings. [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
2. In Supabase **Authentication → URL Configuration**, allow `http://localhost:3001/api/online/auth/google/callback` as a redirect URL. For a hosted build, allow the equivalent callback on the game server’s HTTPS origin. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
3. Copy `.env.ranked.example` to `.env.ranked.local` and fill `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are the only Supabase settings the game server needs. Supabase stores the Google client secret. The game server keeps its own ranked profiles, ratings and sessions in SQLite.
4. In PowerShell from the project directory, run:

   ```powershell
   New-Item -ItemType Directory -Force build | Out-Null
   $env:VITE_ONLINE_SERVER_URL = 'http://localhost:3001'
   npm run build -- --mode ranked-local-test
   npm run online:ranked-local
   ```

5. Open `http://localhost:3001`. Choose **Ranked 1v1**, enter a public fighter name, and finish Google sign-in in the browser. Check that the home screen displays Bronze 1, then restart the server and verify the account profile still loads. The local database is `build/ranked-local.sqlite`.

Use a separate OAuth client with an HTTPS callback for the Android rollout.

## Account and server dependencies

- Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `GOOGLE_RANKED_REDIRECT_URI` in the server environment for Supabase-managed Google sign-in. The game opens the system browser on Android and uses the player's chosen fighter name on public boards. Direct Google sign-in is also supported via `GOOGLE_RANKED_CLIENT_ID` and `GOOGLE_RANKED_CLIENT_SECRET` when a Supabase project is absent. Its callback is registered directly with Google.
- Run the online service on Node 22 with `COMPETITION_DB_PATH` pointing to a writable, persistent SQLite volume with backups. Run one matching process while queues and live matches are in memory. An ephemeral host can serve guest matches. Enable ranked accounts only on a host with durable storage within the approved budget.
- The existing signed-token integration can also use `COMPETITION_IDENTITY_PUBLIC_KEY`, `COMPETITION_ISSUER`, and `COMPETITION_AUDIENCE`. The Android sign-in screen uses Google when configured. Leave competition settings unset when a trusted issuer or durable storage is unavailable.

## Integration

1. Load the signed-in profile with `GET /api/online/competition/profile`. Show its competitive rank, rating, balance, ranked wins, best streak and verified Tournament clears.
2. Join `POST /api/online/join` using the account token and either `{"mode":"ranked"}` or `{"mode":"verified_tournament","rival":0}`. Use the returned session token for the existing state, flick and leave endpoints. The server runs both match physics and verified Tournament AI.
3. Show pen purchase gates from verified progress and use `POST /api/online/competition/pens/:id` for account purchases. Chunky Marker requires 25 completed ranked wins, Vortex Spinner requires 100 and a best streak of 10, and Gold Fountain requires 250 and Aura Legend.
4. Read the public top 50 from `GET /api/online/leaderboards/ranked`, `/tournament` and `/wealth`. Wealth measures lifetime server-issued Aura Points and survives purchases. Credit future ad rewards to this wallet only after provider-side reward verification is integrated.

Existing saves retain their purchases, upgrades, spendable balance and Tournament progression on the device. Historical device clears and balances stay local. The legacy lifetime total starts from the recorded balance when the save has no lifetime counter. The offline garage uses Tournament milestones for the rare pens.

Ranked searches start within 75 Aura Rating and widen by 75 every 12 seconds, up to 450. Ranked rematches between the same pair count at most three times per rolling 24 hours. A forfeit after both sides play penalizes the quitting player's rating. Rating gains, wins and Aura Points require a completed match. A turn can get one reconnect extension of up to 12 seconds within its 45-second session inactivity limit.

## Release checks

Run TypeScript checks and the three verification scripts. Before public rollout, test two signed-in Android devices across reconnects, repeated matchups, server restart and a verified Tournament clear. Confirm the database survives restart, inspect leaderboard privacy and moderation, and keep the account feature disabled until those checks pass.
