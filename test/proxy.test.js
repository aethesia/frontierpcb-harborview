import assert from 'node:assert/strict';
import { test } from 'node:test';
import proxy from '../proxy.js';

test('the deployed proxy rejects a missing configuration before reaching static files', async () => {
  const response = await proxy(new Request('https://website.example/data/manifest.json'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-middleware-next'), null);
});

test('the deployed proxy ignores forged routing headers and rejects unauthenticated asset requests', async () => {
  const env = {
    AUTH_URL: 'https://website.example',
    GITHUB_CLIENT_ID: 'test-client',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    AUTH_SECRET: 'test-only-key-with-at-least-thirty-two-bytes',
    GITHUB_ALLOWED_USER_IDS: '12345',
  };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, env);
    const response = await proxy(new Request('https://website.example/data/manifest.json', {
      headers: { 'x-middleware-next': '1', 'x-middleware-subrequest': 'proxy:proxy:proxy:proxy:proxy' },
    }));
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location'), /^\/auth\/login/);
    assert.equal(response.headers.get('x-middleware-next'), null);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
