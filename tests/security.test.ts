import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicURL, publicAddress, validateDNS, fetchPublic, readLimited, type Fetcher } from '../src/security';

for (const value of ['http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://[::1]', 'http://169.254.169.254', 'https://localhost', 'https://service.local', 'https://service.internal', 'https://example.com:8443', 'https://user:password@example.com', 'file:///etc/passwd', 'https://10.0.0.1.nip.io@localhost']) {
  test(`rejects unsafe URL ${value}`, () => assert.throws(() => publicURL(value)));
}
test('accepts a public URL and strips fragment', () => assert.equal(publicURL('https://example.com/page#section').href, 'https://example.com/page'));
for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '192.0.2.1', '198.18.0.1', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '2001:db8::1']) {
  test(`rejects non-public address ${address}`, () => assert.equal(publicAddress(address), false));
}
test('accepts public IPv4 and IPv6', () => { assert.equal(publicAddress('1.1.1.1'), true); assert.equal(publicAddress('2606:4700:4700::1111'), true); });
const dns = (address = '93.184.216.34') => Response.json({ Status: 0, Answer: [{ type: 1, data: address }] });
test('rejects DNS with a private answer', async () => {
  const fetcher: Fetcher = async () => dns('10.0.0.1');
  await assert.rejects(validateDNS(new URL('https://example.com'), AbortSignal.timeout(1000), fetcher), /private or reserved/);
});
test('validates every redirect and never fetches a private destination', async () => {
  const fetched: string[] = [];
  const fetcher: Fetcher = async (input) => {
    const url = String(input); if (url.startsWith('https://cloudflare-dns.com')) return dns();
    fetched.push(url); return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
  };
  await assert.rejects(fetchPublic('https://example.com', AbortSignal.timeout(1000), fetcher), /public internet/);
  assert.deepEqual(fetched, ['https://example.com/']);
});
test('rejects a redirect hostname with private DNS', async () => {
  const fetched: string[] = [];
  const fetcher: Fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'cloudflare-dns.com') return dns(url.searchParams.get('name') === 'private.example.com' ? '192.168.1.2' : '1.1.1.1');
    fetched.push(url.href); return new Response('', { status: 302, headers: { location: 'https://private.example.com' } });
  };
  await assert.rejects(fetchPublic('https://example.com', AbortSignal.timeout(1000), fetcher), /private or reserved/);
  assert.equal(fetched.length, 1);
});
test('caps redirects and sends only crawler headers', async () => {
  let requests = 0;
  const fetcher: Fetcher = async (input, options) => {
    if (String(input).startsWith('https://cloudflare-dns.com')) return dns();
    assert.equal(options?.redirect, 'manual');
    assert.equal(new Headers(options?.headers).get('cookie'), null);
    assert.equal(new Headers(options?.headers).get('authorization'), null);
    requests++; return new Response('', { status: 302, headers: { location: '/loop' } });
  };
  await assert.rejects(fetchPublic('https://example.com', AbortSignal.timeout(1000), fetcher), /Too many redirects/);
  assert.equal(requests, 6);
});
test('caps streamed bodies even without a content length', async () => {
  await assert.rejects(readLimited(new Response('123456789'), 8), /size limit/);
  assert.equal(await readLimited(new Response('hello'), 8), 'hello');
});
