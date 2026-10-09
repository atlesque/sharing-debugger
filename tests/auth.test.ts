import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { authorized } from '../src/auth';
import worker from '../src/index';
const config = { ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', ACCESS_AUD: 'test-audience', ALLOWED_EMAIL: 'owner@example.com' };
const { privateKey, publicKey } = await generateKeyPair('RS256');
const sign = (email: string, audience = config.ACCESS_AUD, issuer = config.ACCESS_TEAM_DOMAIN, expiry = '1h') => new SignJWT({ email }).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setExpirationTime(expiry).setSubject('test-user').setAudience(audience).setIssuer(issuer).sign(privateKey);
const request = (token: string) => new Request('https://app.example.com', { headers: { 'cf-access-jwt-assertion': token } });
test('accepts a signed Access JWT for the configured email', async () => assert.equal(await authorized(request(await sign('owner@example.com')), config, async () => publicKey), true));
test('rejects another email', async () => assert.equal(await authorized(request(await sign('other@example.com')), config, async () => publicKey), false));
test('rejects wrong audience', async () => assert.equal(await authorized(request(await sign('owner@example.com', 'wrong')), config, async () => publicKey), false));
test('rejects wrong issuer', async () => assert.equal(await authorized(request(await sign('owner@example.com', config.ACCESS_AUD, 'https://wrong.cloudflareaccess.com')), config, async () => publicKey), false));
test('rejects expired token', async () => assert.equal(await authorized(request(await sign('owner@example.com', config.ACCESS_AUD, config.ACCESS_TEAM_DOMAIN, '-1s')), config, async () => publicKey), false));
test('rejects forged token', async () => assert.equal(await authorized(request('eyJhbGciOiJub25lIn0.eyJlbWFpbCI6Im93bmVyQGV4YW1wbGUuY29tIn0.'), config, async () => publicKey), false));
test('fails closed with missing configuration', async () => assert.equal(await authorized(request(await sign('owner@example.com')), { ...config, ACCESS_AUD: '' }, async () => publicKey), false));
test('protects assets and API without authentication', async () => {
  for (const path of ['/', '/app.js', '/api/inspect', '/api/image']) {
    const response = await worker.fetch(new Request('https://app.example.com'+path), { ...config } as Env);
    assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
