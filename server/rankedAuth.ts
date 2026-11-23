import { createHash, randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import type { Identity } from './competition';

interface Challenge {
  launch: string;
  deadline: number;
  name: string;
  state: string;
  verifier: string;
  returnToApp: boolean;
  started: boolean;
  consumed: boolean;
  failed?: boolean;
  redeeming?: boolean;
  identity?: Identity;
  token?: string;
}

const secret = () => randomBytes(32).toString('base64url');
const validSecret = /^[A-Za-z0-9_-]{43}$/;
const lifetime = 5 * 60_000;
export type RankedAuthConfig = { redirectUri: string } & (
  { provider?: 'google'; clientId: string; clientSecret: string } |
  { provider: 'supabase'; projectUrl: string; publishableKey: string }
);
const supabaseCookie = 'pf_supabase_state';

function signInPage(res: Response, status: number, returnToApp = false) {
  const title = status === 200 ? 'You’re signed in' : 'Sign-in didn’t finish';
  const message = status === 200 ? 'Return to Pen Fight Aura Wars to play Ranked.'
    : 'Return to Pen Fight Aura Wars and try signing in again.';
  const button = returnToApp
    ? '<a href="intent://ranked-auth/complete#Intent;scheme=penfightaurawars;package=com.penfightroyale.game;end">Return to game</a>'
    : '<p class="hint">You can close this tab.</p>';
  res.status(status).set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
  }).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Pen Fight Aura Wars</title><style>
:root { color-scheme: dark; font: 16px system-ui, sans-serif; background: #0a1220; color: #e7f3ff; }
body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
main { max-width: 400px; text-align: center; padding: 32px 24px; background: #111f32; border: 1px solid #27516a; border-radius: 24px; }
.brand { color: #9fe7f7; font-weight: 700; }
h1 { margin: 12px 0; font-size: 1.75rem; } p { line-height: 1.5; }
a { display: block; padding: 14px; margin-top: 24px; border-radius: 12px; background: #79e4f5; color: #101c2d; font-weight: 750; }
.hint { color: #bdcddd; }
</style></head><body><main><div class="brand">Pen Fight Aura Wars</div><h1>${title}</h1><p>${message}</p>${button}</main></body></html>`);
}

interface RankedAccountStore {
  createAccountSession(identity: Identity, now: number): string | Promise<string>;
  revokeAccountSession(authorization: string | undefined): void | Promise<void>;
}

export function createRankedAuth(store: RankedAccountStore, config: RankedAuthConfig,
  fetchProvider = fetch) {
  const redirect = new URL(config.redirectUri);
  if (redirect.pathname !== '/api/online/auth/google/callback' || redirect.search || redirect.hash
    || (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && redirect.hostname === 'localhost'))) {
    throw new Error('Invalid GOOGLE_RANKED_REDIRECT_URI.');
  }
  const project = config.provider === 'supabase' ? new URL(config.projectUrl) : null;
  if (project && (project.protocol !== 'https:' || project.pathname !== '/' || project.search || project.hash
    || project.username || project.password)) throw new Error('SUPABASE_URL must be an HTTPS project origin.');
  const challenges = new Map<string, Challenge>();
  const router = Router();
  const active = (value: Challenge | undefined) => value && value.deadline > Date.now() ? value : undefined;
  router.post('/auth/google', (req, res) => {
    const name = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    if (!/^[\p{L}\p{N}][\p{L}\p{N} _'-]{1,23}$/u.test(name)) { res.sendStatus(400); return; }
    for (const [key, challenge] of challenges) if (!active(challenge)) challenges.delete(key);
    if (challenges.size >= 200) { res.sendStatus(429); return; }
    const key = secret();
    const launch = secret();
    challenges.set(key, {
      launch, deadline: Date.now() + lifetime, name, state: secret(), verifier: secret(),
      started: false, consumed: false, returnToApp: req.body?.returnToApp === true,
    });
    res.status(201).json({ check: key, url: new URL(`/api/online/auth/google/start/${launch}`, redirect).href });
  });

  router.get('/auth/google/start/:launch', (req, res) => {
    const attempt = validSecret.test(req.params.launch)
      ? active([...challenges.values()].find(item => item.launch === req.params.launch)) : undefined;
    if (!attempt || attempt.started) { signInPage(res, 410, attempt?.returnToApp); return; }
    attempt.started = true;
    const origin = project ? new URL('/auth/v1/authorize', project) : new URL('https://accounts.google.com/o/oauth2/v2/auth');
    const challenge = createHash('sha256').update(attempt.verifier).digest('base64url');
    const params = config.provider === 'supabase' ? new URLSearchParams({
      provider: 'google', redirect_to: redirect.href, code_challenge: challenge,
      code_challenge_method: 's256', prompt: 'select_account',
    }) : new URLSearchParams({
      client_id: config.clientId, redirect_uri: redirect.href, response_type: 'code', scope: 'openid',
      state: attempt.state, code_challenge: challenge,
      code_challenge_method: 'S256', prompt: 'select_account',
    });
    origin.search = params.toString();
    res.cookie(project ? supabaseCookie : `pf_signin_${attempt.state.slice(0, 12)}`, attempt.state, {
      httpOnly: true, sameSite: 'lax', secure: redirect.protocol === 'https:', maxAge: lifetime, path: redirect.pathname,
    });
    res.set('Referrer-Policy', 'no-referrer').redirect(origin.href);
  });

  router.get('/auth/google/callback', async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer');
    const cookies = req.get('Cookie')?.split(';').map(pair => pair.trim()) ?? [];
    const state = project ? cookies.find(pair => pair.startsWith(supabaseCookie + '='))?.slice(supabaseCookie.length + 1) ?? ''
      : typeof req.query.state === 'string' ? req.query.state : '';
    const cookieName = project ? supabaseCookie : `pf_signin_${state.slice(0, 12)}`;
    const attempt = validSecret.test(state) && cookies.includes(`${cookieName}=${state}`)
      ? active([...challenges.values()].find(item => item.state === state)) : undefined;
    if (!attempt || attempt.consumed) { signInPage(res, 410, attempt?.returnToApp); return; }
    attempt.consumed = true;
    res.clearCookie(cookieName, { path: redirect.pathname });
    try {
      if (typeof req.query.code !== 'string') throw new Error('Authorization denied');
      let sub: unknown;
      if (config.provider === 'supabase' && project) {
        const credentials = await fetchProvider(new URL('/auth/v1/token?grant_type=pkce', project).href, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(7000),
          headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_code: req.query.code, code_verifier: attempt.verifier }),
        });
        if (!credentials.ok) throw new Error('Supabase token exchange failed');
        const data = await credentials.json();
        const identities = Array.isArray(data.user?.identities) ? data.user.identities : [];
        sub = identities.find((identity: { provider?: string }) => identity?.provider === 'google')?.identity_data?.sub;
      } else if (config.provider !== 'supabase') {
        const credentials = await fetchProvider('https://oauth2.googleapis.com/token', {
          method: 'POST', signal: AbortSignal.timeout(7000),
          body: new URLSearchParams({
            client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirect.href,
            code: req.query.code, code_verifier: attempt.verifier, grant_type: 'authorization_code',
          }),
        });
        if (!credentials.ok) throw new Error('Token exchange failed');
        const { access_token } = await credentials.json();
        if (typeof access_token !== 'string') throw new Error('Missing provider token');
        const response = await fetchProvider('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(7000),
        });
        if (!response.ok) throw new Error('Could not verify account');
        ({ sub } = await response.json());
      }
      if (typeof sub !== 'string' || !/^[\w.-]{1,128}$/.test(sub)) throw new Error('Invalid subject');
      attempt.identity = { id: `google:${sub}`, displayName: attempt.name };
      signInPage(res, 200, attempt.returnToApp);
    } catch {
      attempt.failed = true;
      signInPage(res, 400, attempt.returnToApp);
    }
  });

  router.post('/auth/google/check', async (req, res, next) => {
    const attempt = typeof req.body?.check === 'string' ? active(challenges.get(req.body.check)) : undefined;
    if (!attempt || attempt.failed) { res.sendStatus(410); return; }
    if (attempt.token) { res.json({ token: attempt.token }); return; }
    if (!attempt.identity || attempt.redeeming) { res.sendStatus(202); return; }
    attempt.redeeming = true;
    try {
      const token = await store.createAccountSession(attempt.identity, Date.now());
      // Android may lose the response when the browser backgrounds its WebView.
      // Let the same private check key recover the same session until it expires.
      if (attempt.returnToApp) attempt.token = token;
      else challenges.delete(req.body.check);
      attempt.redeeming = false;
      res.json({ token });
    } catch (error) {
      attempt.redeeming = false;
      next(error);
    }
  });
  router.delete('/auth/session', async (req, res, next) => {
    try {
      await store.revokeAccountSession(req.get('Authorization'));
      res.sendStatus(204);
    } catch (error) { next(error); }
  });
  return router;
}
