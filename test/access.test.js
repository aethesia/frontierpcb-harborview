import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccessHandler, safeNext } from '../server/access.js';

const origin = 'https://website.example';
const sessionName = '__Host-harborview_session';
const oauthName = '__Host-harborview_oauth';

function fixture(overrides = {}, profile = { id: 12345, login: 'reviewer' }) {
  const env = {
    AUTH_URL: origin,
    GITHUB_CLIENT_ID: 'test-client',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    AUTH_SECRET: 'test-only-signing-key-with-at-least-32-bytes',
    GITHUB_ALLOWED_USERS: 'reviewer',
    ...overrides,
  };
  let now = Date.UTC(2026, 0, 1);
  const calls = [];
  let failure = false;
  const handler = createAccessHandler({
    env: () => env,
    clock: () => now,
    next: () => new Response('protected content', { headers: { 'X-Protected-Content': 'yes' } }),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      if (failure) return Response.json({ error: 'upstream_error' }, { status: 503 });
      return Response.json(url.endsWith('/access_token')
        ? { access_token: 'private-test-access-token', token_type: 'bearer' }
        : profile);
    },
  });
  const request = (path = '/', options = {}) => handler(new Request(new URL(path, origin), options));
  return { env, calls, request,
    advance: (seconds) => { now += seconds * 1000; },
    fail: () => { failure = true; },
  };
}

function responseCookie(response, name) {
  return response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`))?.split(';')[0];
}

async function startLogin(f, destination = '/') {
  const response = await f.request(`/auth/github?next=${encodeURIComponent(destination)}`);
  assert.equal(response.status, 302);
  const url = new URL(response.headers.get('location'));
  return { response, url, cookie: responseCookie(response, oauthName) };
}

async function finishLogin(f, flow) {
  return f.request(`/auth/github/callback?code=test-code&state=${flow.url.searchParams.get('state')}`, {
    headers: { cookie: flow.cookie },
  });
}

test('every page, image, script, data file and download requires authentication', async () => {
  const f = fixture();
  const paths = ['/', '/index.html', '/jobs/example', '/trials/example', '/compare', '/tasks/example',
    '/data/manifest.json', '/data/blobs/example.gz', '/fonts/GoogleSansCode-VariableFont_wght.ttf', '/assets/static-api.js',
    '/public/index.html', '/server/access.js', '/.env', '/missing'];
  for (const path of paths) {
    const response = await f.request(path);
    assert.equal(response.status, 302, path);
    assert.match(response.headers.get('location'), /^\/auth\/login\?next=/, path);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('x-protected-content'), null);
  }
  assert.equal(f.calls.length, 0);
});

test('incomplete configuration fails closed and does not reveal configuration values', async () => {
  for (const overrides of [
    { AUTH_URL: '' }, { AUTH_URL: 'http://website.example' }, { AUTH_URL: `${origin}/path` },
    { GITHUB_CLIENT_ID: '' }, { GITHUB_CLIENT_SECRET: '' }, { AUTH_SECRET: 'short' },
    { GITHUB_ALLOWED_USERS: '' }, { GITHUB_ALLOWED_USERS: 'not/a/user' },
    { GITHUB_ALLOWED_USER_IDS: 'abc' },
  ]) {
    const f = fixture(overrides);
    const response = await f.request('/data/manifest.json');
    assert.equal(response.status, 503);
    const html = await response.text();
    assert.doesNotMatch(html, /test-client-secret|test-only-signing|AUTH_SECRET|GITHUB_ALLOWED/);
    assert.equal(f.calls.length, 0);
  }
});

test('login page is accessible and contains no website data or account list', async () => {
  const response = await fixture().request('/auth/login');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /使用 GitHub 登录/);
  assert.doesNotMatch(html, /reviewer|test-client|benchmark\.json|hero\.webp/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
});

test('OAuth authorization uses random state, S256 PKCE, a fixed callback and no repository scopes', async () => {
  const f = fixture();
  const first = await startLogin(f, '/jobs/example');
  const second = await startLogin(f);
  assert.equal(first.url.origin, 'https://github.com');
  assert.equal(first.url.pathname, '/login/oauth/authorize');
  assert.equal(first.url.searchParams.get('client_id'), 'test-client');
  assert.equal(first.url.searchParams.get('redirect_uri'), `${origin}/auth/github/callback`);
  assert.equal(first.url.searchParams.get('scope'), '');
  assert.equal(first.url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(first.url.searchParams.get('state'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(first.url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.url.searchParams.get('state'), second.url.searchParams.get('state'));
  const cookie = first.response.headers.get('set-cookie');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(cookie.includes(attribute));
  assert.ok(!cookie.includes('Domain='));
});

test('an allowed user signs in, receives a protected cookie and can view protected assets', async () => {
  const f = fixture({ GITHUB_ALLOWED_USERS: 'OtherUser, ReVieWer' });
  const flow = await startLogin(f, '/data/manifest.json');
  const response = await finishLogin(f, flow);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/data/manifest.json');
  const session = responseCookie(response, sessionName);
  assert.ok(session);
  assert.doesNotMatch(session, /private-test-access-token/);
  const opened = await f.request('/data/manifest.json', { headers: { cookie: session } });
  assert.equal(await opened.text(), 'protected content');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].url, 'https://api.github.com/user');
  assert.equal(f.calls[1].init.headers.Authorization, 'Bearer private-test-access-token');
  const body = f.calls[0].init.body;
  assert.equal(body.get('redirect_uri'), `${origin}/auth/github/callback`);
  assert.equal(body.get('client_secret'), 'test-client-secret');
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')));
  assert.equal(Buffer.from(hashed).toString('base64url'), flow.url.searchParams.get('code_challenge'));
});

test('numeric GitHub IDs allow access without trusting changeable usernames', async () => {
  const f = fixture({ GITHUB_ALLOWED_USERS: '', GITHUB_ALLOWED_USER_IDS: '12345' });
  const response = await finishLogin(f, await startLogin(f));
  assert.ok(responseCookie(response, sessionName));
});

test('successful login returns to a viewer detail route and grants access to compressed trajectory data', async () => {
  const f = fixture();
  const destination = '/trials/example?tab=trajectory';
  const response = await finishLogin(f, await startLogin(f, destination));
  assert.equal(response.headers.get('location'), destination);
  const session = responseCookie(response, sessionName);
  for (const path of [destination, '/data/manifest.json', '/data/blobs/example.gz']) {
    const opened = await f.request(path, { headers: { cookie: session } });
    assert.equal(opened.status, 200, path);
    assert.equal(opened.headers.get('x-protected-content'), 'yes', path);
  }
});

test('a cookie from the sibling benchmark site is not a viewer session', async () => {
  const f = fixture();
  const response = await finishLogin(f, await startLogin(f));
  const session = responseCookie(response, sessionName);
  const siblingCookie = session.replace(sessionName, '__Host-frontierpcb_session');
  const opened = await f.request('/data/manifest.json', { headers: { cookie: siblingCookie } });
  assert.equal(opened.status, 302);
});

test('a valid GitHub login outside the allowlist is denied', async () => {
  const f = fixture({}, { login: 'outsider', id: 99999 });
  const response = await finishLogin(f, await startLogin(f));
  assert.equal(response.headers.get('location'), '/auth/error?reason=denied');
  assert.equal(responseCookie(response, sessionName), `${sessionName}=`);
  const denied = await f.request('/auth/error?reason=denied');
  assert.equal(denied.status, 403);
});

test('missing state, incorrect state, missing cookies and cancelled OAuth are rejected without calling GitHub', async () => {
  for (const variant of ['wrong-state', 'no-state', 'no-cookie', 'cancelled']) {
    const f = fixture();
    const flow = await startLogin(f);
    const params = new URLSearchParams({ code: 'test-code', state: flow.url.searchParams.get('state') });
    if (variant === 'wrong-state') params.set('state', 'attacker');
    if (variant === 'no-state') params.delete('state');
    if (variant === 'cancelled') params.set('error', 'access_denied');
    const response = await f.request(`/auth/github/callback?${params}`, { headers: variant === 'no-cookie' ? {} : { cookie: flow.cookie } });
    assert.equal(response.headers.get('location'), '/auth/error?reason=expired', variant);
    assert.equal(f.calls.length, 0);
  }
});

test('expired and tampered OAuth cookies cannot create sessions', async () => {
  const f = fixture();
  const flow = await startLogin(f);
  const changed = { ...flow, cookie: flow.cookie.replace('=', '=x') };
  const tampered = await finishLogin(f, changed);
  assert.equal(tampered.headers.get('location'), '/auth/error?reason=expired');
  f.advance(601);
  const expired = await finishLogin(f, flow);
  assert.equal(expired.headers.get('location'), '/auth/error?reason=expired');
  assert.equal(f.calls.length, 0);
});

test('expired, tampered and revoked sessions cannot access website files', async () => {
  const f = fixture();
  const response = await finishLogin(f, await startLogin(f));
  const session = responseCookie(response, sessionName);
  const tampered = await f.request('/', { headers: { cookie: session.replace('=', '=x') } });
  assert.equal(tampered.status, 302);
  f.env.GITHUB_ALLOWED_USERS = 'another-person';
  const revoked = await f.request('/', { headers: { cookie: session } });
  assert.equal(revoked.status, 302);
  f.env.GITHUB_ALLOWED_USERS = 'reviewer';
  f.advance(8 * 60 * 60 + 1);
  assert.equal((await f.request('/', { headers: { cookie: session } })).status, 302);
});

test('GitHub errors fail closed and never return upstream tokens', async () => {
  const f = fixture();
  const flow = await startLogin(f);
  f.fail();
  const response = await finishLogin(f, flow);
  assert.equal(response.headers.get('location'), '/auth/error?reason=unavailable');
  assert.equal(responseCookie(response, sessionName), undefined);
});

test('return URLs reject open redirects and authentication loops', async () => {
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/%5cevil.example',
    '/%0devil', '/%20evil', '/auth/login', '/auth/github', '/auth/logout', '/broken%']) {
    assert.equal(safeNext(value), '/', value);
  }
  assert.equal(safeNext('/jobs/example?q=1'), '/jobs/example?q=1');
  const f = fixture();
  const response = await finishLogin(f, await startLogin(f, '//evil.example'));
  assert.equal(response.headers.get('location'), '/');
});

test('alternate deployment origins redirect to the configured site and cannot accept callbacks', async () => {
  const f = fixture();
  const redirected = await f.request('https://preview.example/data/manifest.json');
  assert.equal(redirected.status, 307);
  assert.equal(redirected.headers.get('location'), `${origin}/data/manifest.json`);
  const callback = await f.request('https://preview.example/auth/github/callback?code=test-code');
  assert.equal(callback.status, 400);
  assert.equal(f.calls.length, 0);
});

test('logout clears both cookies only after a same-origin POST', async () => {
  const f = fixture();
  const response = await finishLogin(f, await startLogin(f));
  const session = responseCookie(response, sessionName);
  const crossSite = await f.request('/auth/logout', { method: 'POST', headers: { cookie: session, origin: 'https://evil.example' } });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.get('set-cookie'), null);
  const logout = await f.request('/auth/logout', { method: 'POST', headers: { cookie: session, origin } });
  assert.equal(logout.status, 303);
  assert.equal(responseCookie(logout, sessionName), `${sessionName}=`);
  assert.equal(responseCookie(logout, oauthName), `${oauthName}=`);
});

test('authenticated visitors skip the login page; unknown auth routes remain unavailable', async () => {
  const f = fixture();
  const response = await finishLogin(f, await startLogin(f));
  const session = responseCookie(response, sessionName);
  const login = await f.request(`/auth/login?next=${encodeURIComponent('/data/manifest.json')}`, { headers: { cookie: session } });
  assert.equal(login.headers.get('location'), '/data/manifest.json');
  assert.equal((await f.request('/auth/missing')).status, 404);
  assert.equal((await f.request('/', { method: 'POST' })).status, 405);
});
