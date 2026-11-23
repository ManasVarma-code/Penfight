import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { Identity } from './competition';

interface Challenge {
  launch: string;
  deadline: number;
  name: string;
  state: string;
  verifier: string;
  started: boolean;
  consumed: boolean;
  failed?: boolean;
  redeeming?: boolean;
  identity?: Identity;
}

const secret = () => randomBytes(32).toString('base64url');
const validSecret = /^[A-Za-z0-9_-]{43}$/;
const lifetime = 5 * 60_000;
export type RankedAuthConfig = { redirectUri: string } & (
  { provider?: 'google'; clientId: string; clientSecret: string } |
  { provider: 'supabase'; projectUrl: string; publishableKey: string }
);
const supabaseCookie = 'pf_supabase_state';

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
      started: false, consumed: false,
    });
    res.status(201).json({ check: key, url: new URL(`/api/online/auth/google/start/${launch}`, redirect).href });
  });

  router.get('/auth/google/start/:launch', (req, res) => {
    const attempt = validSecret.test(req.params.launch)
      ? active([...challenges.values()].find(item => item.launch === req.params.launch)) : undefined;
    if (!attempt || attempt.started) { res.status(410).send('Open a new sign-in request in Pen Fight Aura Wars.'); return; }
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
    if (!attempt || attempt.consumed) { res.status(410).send('This sign-in request has expired. Return to the game.'); return; }
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
      res.send('Signed in. Return to Pen Fight Aura Wars to play Ranked.');
    } catch {
      attempt.failed = true;
      res.status(400).send('Sign-in could not be completed. Return to the game to try again.');
    }
  });

  router.post('/auth/google/check', async (req, res, next) => {
    const attempt = typeof req.body?.check === 'string' ? active(challenges.get(req.body.check)) : undefined;
    if (!attempt || attempt.failed) { res.sendStatus(410); return; }
    if (!attempt.identity || attempt.redeeming) { res.sendStatus(202); return; }
    attempt.redeeming = true;
    try {
      const token = await store.createAccountSession(attempt.identity, Date.now());
      challenges.delete(req.body.check);
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
