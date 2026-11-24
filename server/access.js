const SESSION_COOKIE = '__Host-harborview_session';
const OAUTH_COOKIE = '__Host-harborview_oauth';
const SESSION_SECONDS = 8 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;
const encoder = new TextEncoder();

const headers = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function base64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function unbase64(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
}

async function digest(value) {
  return base64(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function random() {
  return base64(crypto.getRandomValues(new Uint8Array(32)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(value, key) {
  const payload = base64(encoder.encode(JSON.stringify(value)));
  return `${payload}.${base64(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))}`;
}

async function verify(token, key, kind, policy, now) {
  if (!token || token.length > 3800) return null;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;
    if (!await crypto.subtle.verify('HMAC', key, unbase64(signature), encoder.encode(payload))) return null;
    const value = JSON.parse(new TextDecoder().decode(unbase64(payload)));
    if (value.kind !== kind || value.policy !== policy || !Number.isSafeInteger(value.exp) || value.exp <= now) return null;
    return value;
  } catch {
    return null;
  }
}

function cookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const split = part.indexOf('=');
    if (split < 1) continue;
    if (part.slice(0, split).trim() === name) return part.slice(split + 1).trim();
  }
  return '';
}

function setCookie(name, value, age) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}

export function safeNext(value) {
  if (typeof value !== 'string' || value.length > 1000) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\x00-\x20\x7f]/.test(decoded)) return '/';
    const target = new URL(value, 'https://site.invalid');
    if (target.origin !== 'https://site.invalid' || target.pathname === '/auth' || target.pathname.startsWith('/auth/')) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(title, message, action = '', status = 200) {
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · FrontierPCB Harbor Viewer</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#f6f5f1;color:#24291f;font:16px/1.75 system-ui,-apple-system,sans-serif}main{width:min(100%,460px);padding:46px 38px;background:#fff;border:1px solid #deded3;border-radius:14px;box-shadow:0 14px 60px #24351e08}.brand{font-size:13px;letter-spacing:.12em;color:#536747}h1{margin:24px 0 12px;font-size:28px;line-height:1.35;font-weight:600}p{color:#62695b;margin:0 0 28px}a,button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:13px 18px;border:0;border-radius:7px;background:#263d27;color:#fff;font:600 15px/1.5 system-ui;text-decoration:none;cursor:pointer}a:focus-visible,button:focus-visible{outline:3px solid #8eab75;outline-offset:4px}small{display:block;margin-top:24px;font-size:12px;color:#858a7e}svg{width:20px;height:20px;fill:currentColor}
  </style></head><body><main><div class="brand">FRONTIERPCB HARBOR VIEWER</div><h1>${escape(title)}</h1><p>${escape(message)}</p>${action}<small>From code to copper.</small></main></body></html>`, { status, headers });
}

function redirect(location, cookies = [], status = 302) {
  const response = new Response(null, { status, headers: { ...headers, Location: location } });
  for (const value of cookies) response.headers.append('Set-Cookie', value);
  return response;
}

function loginPage(next) {
  return page('登录后访问', '请使用获准访问的 GitHub 账号登录。',
    `<a href="/auth/github?next=${encodeURIComponent(next)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.6-2.81 5.63-5.49 5.93.43.37.82 1.1.82 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z"/></svg>使用 GitHub 登录</a>`);
}

function values(value) {
  return [...new Set((value || '').split(/[\s,]+/).filter(Boolean).map((item) => item.toLowerCase()))].sort();
}

async function settings(env) {
  const origin = new URL(env.AUTH_URL || 'invalid:');
  const names = values(env.GITHUB_ALLOWED_USERS);
  const ids = values(env.GITHUB_ALLOWED_USER_IDS);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
      || !env.GITHUB_CLIENT_ID?.trim() || !env.GITHUB_CLIENT_SECRET?.trim()
      || encoder.encode(env.AUTH_SECRET || '').length < 32 || (!names.length && !ids.length)
      || names.some((name) => !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/.test(name))
      || ids.some((id) => !/^[1-9]\d*$/.test(id))) throw new Error('Access configuration is incomplete');
  return {
    origin: origin.origin, names, ids,
    clientId: env.GITHUB_CLIENT_ID.trim(), clientSecret: env.GITHUB_CLIENT_SECRET.trim(),
    key: await hmacKey(env.AUTH_SECRET),
    policy: await digest(JSON.stringify([origin.origin, env.GITHUB_CLIENT_ID, names, ids])),
  };
}

function allowed(profile, config) {
  return typeof profile?.login === 'string' && /^[1-9]\d*$/.test(String(profile?.id))
    && (config.names.includes(profile.login.toLowerCase()) || config.ids.includes(String(profile.id)));
}

async function githubJson(fetcher, url, init) {
  const response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('GitHub request failed');
  return response.json();
}

export function createAccessHandler({ env = () => process.env, fetcher = (...args) => fetch(...args), clock = () => Date.now(), next } = {}) {
  return async function access(request) {
    let config;
    try {
      config = await settings(env());
    } catch {
      return page('暂时无法登录', '网站访问验证尚未准备就绪，请稍后重试。', '', 503);
    }
    const url = new URL(request.url);
    const seconds = Math.floor(clock() / 1000);
    const oauthClear = setCookie(OAUTH_COOKIE, '', 0);
    const sessionClear = setCookie(SESSION_COOKIE, '', 0);
    const callback = `${config.origin}/auth/github/callback`;
    const session = await verify(cookie(request, SESSION_COOKIE), config.key, 'session', config.policy, seconds);
    const loggedIn = session && allowed(session, config);

    // A single configured origin binds OAuth state, cookies and callback URLs together.
    if (url.origin !== config.origin) {
      if (url.pathname === '/auth/github/callback') return page('登录未完成', '请从网站主页重新登录。', '', 400);
      return redirect(`${config.origin}${url.pathname}${url.search}`, [], 307);
    }

    if (url.pathname === '/auth/logout') {
      if (request.method === 'GET') return page('退出登录', '确认退出 Harbor Viewer？', '<form method="post" action="/auth/logout"><button type="submit">退出登录</button></form>');
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
      if (request.headers.get('origin') !== config.origin) return page('请求无效', '请从网站重新发起操作。', '', 403);
      return redirect('/auth/login', [sessionClear, oauthClear], 303);
    }

    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });

    if (url.pathname === '/auth/login') {
      const destination = safeNext(url.searchParams.get('next'));
      return loggedIn ? redirect(destination) : loginPage(destination);
    }

    if (url.pathname === '/auth/github') {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
      const destination = safeNext(url.searchParams.get('next'));
      if (loggedIn) return redirect(destination);
      const state = random();
      const verifier = random();
      const oauth = await sign({ kind: 'oauth', policy: config.policy, state, verifier, next: destination, exp: seconds + OAUTH_SECONDS }, config.key);
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: callback, scope: '', state,
        code_challenge: await digest(verifier), code_challenge_method: 'S256', allow_signup: 'false' }).toString();
      return redirect(authorize.href, [setCookie(OAUTH_COOKIE, oauth, OAUTH_SECONDS)]);
    }

    if (url.pathname === '/auth/github/callback') {
      const oauth = await verify(cookie(request, OAUTH_COOKIE), config.key, 'oauth', config.policy, seconds);
      if (!oauth || oauth.state !== url.searchParams.get('state') || url.searchParams.get('error')
          || !url.searchParams.get('code') || url.searchParams.get('code').length > 1024 || request.method !== 'GET'
          || typeof oauth.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(oauth.verifier)) {
        return redirect('/auth/error?reason=expired', [oauthClear]);
      }
      try {
        const token = await githubJson(fetcher, 'https://github.com/login/oauth/access_token', {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
            code: url.searchParams.get('code'), redirect_uri: callback, code_verifier: oauth.verifier }),
        });
        if (typeof token.access_token !== 'string' || token.error || token.token_type?.toLowerCase() !== 'bearer') throw new Error('Invalid GitHub response');
        const profile = await githubJson(fetcher, 'https://api.github.com/user', {
          headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'FrontierPCB' },
        });
        if (!allowed(profile, config)) return redirect('/auth/error?reason=denied', [oauthClear, sessionClear]);
        const value = await sign({ kind: 'session', policy: config.policy, id: String(profile.id), login: profile.login,
          exp: seconds + SESSION_SECONDS }, config.key);
        return redirect(safeNext(oauth.next), [oauthClear, setCookie(SESSION_COOKIE, value, SESSION_SECONDS)]);
      } catch {
        return redirect('/auth/error?reason=unavailable', [oauthClear]);
      }
    }

    if (url.pathname === '/auth/error') {
      const reason = url.searchParams.get('reason');
      const message = reason === 'denied' ? '该 GitHub 账号尚未获准访问。请联系网站管理员。'
        : reason === 'expired' ? '本次登录已失效或被取消，请重新登录。' : '暂时无法完成登录，请稍后重试。';
      return page('无法进入网站', message, '<a href="/auth/login">返回登录</a>', reason === 'denied' ? 403 : 400);
    }

    if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return page('页面不存在', '请从网站主页进入。', '', 404);
    if (!loggedIn) return redirect(`/auth/login?next=${encodeURIComponent(safeNext(url.pathname + url.search))}`);
    return next();
  };
}
