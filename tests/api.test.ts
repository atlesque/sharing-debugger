import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from '../src/index';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const env = {
  ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', ACCESS_AUD: 'test-audience', ALLOWED_EMAIL: 'owner@example.com',
  ASSETS: { fetch: async () => new Response('protected asset'), connect: () => { throw new Error('Unused in HTTP tests'); } },
  INSPECT_LIMITER: { limit: async () => ({ success: true }) },
} satisfies Env;
const jwt = await new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(env.ACCESS_TEAM_DOMAIN).setAudience(env.ACCESS_AUD).setSubject('owner').setIssuedAt().setExpirationTime('1h').sign(privateKey);
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'test.cloudflareaccess.com') return Response.json({ keys: [jwk] });
  if (url.hostname === 'cloudflare-dns.com') return Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
  if (url.pathname === '/image.jpg') return new Response(new Uint8Array([255, 216, 255]), { headers: { 'content-type': 'image/jpeg' } });
  return new Response('<title>Example &amp; page</title><meta property="og:title" content="Social title">', { headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' } });
};
const req = (path = '/api/inspect', body: unknown = { url: 'https://example.com' }, origin = 'https://app.example.com') => new Request('https://app.example.com'+path, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-access-jwt-assertion': jwt }, body: JSON.stringify(body) });
test('authenticated inspection returns parsed metadata and HTTP diagnostics', async () => {
  const response = await worker.fetch(req(), env);
  assert.equal(response.status, 200);
  const result = await response.json() as { title: string; previews: { social: { title: string } }; warnings: string[]; headers: Record<string,string> };
  assert.equal(result.title, 'Example & page'); assert.equal(result.previews.social.title, 'Social title');
  assert.equal(result.headers['x-robots-tag'], 'noindex'); assert.ok(result.warnings.includes('X-Robots-Tag prevents indexing.'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('authenticated private URL requests are rejected', async () => {
  const response = await worker.fetch(req('/api/inspect', { url: 'http://127.0.0.1' }), env); assert.equal(response.status, 400);
});
test('cross-origin requests are rejected even with a signed token', async () => {
  assert.equal((await worker.fetch(req('/api/inspect', { url: 'https://example.com' }, 'https://evil.example.com'), env)).status, 403);
});
test('rate-limit denial prevents inspection', async () => {
  const limited = { ...env, INSPECT_LIMITER: { limit: async () => ({ success: false }) } } satisfies Env;
  assert.equal((await worker.fetch(req(), limited)).status, 429);
});
test('image preview uses protected bounded raster response', async () => {
  const response = await worker.fetch(new Request('https://app.example.com/api/image?url=https%3A%2F%2Fexample.com%2Fimage.jpg', { headers: { 'sec-fetch-site': 'same-origin', 'cf-access-jwt-assertion': jwt } }), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal((await response.arrayBuffer()).byteLength, 3);
});
test('authenticated static asset requests pass through the same login validation', async () => {
  const response = await worker.fetch(new Request('https://app.example.com/', { headers: { 'cf-access-jwt-assertion': jwt } }), env);
  assert.equal(await response.text(), 'protected asset'); assert.equal(response.headers.get('x-frame-options'), 'DENY');
});
