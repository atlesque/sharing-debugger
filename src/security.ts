import ipaddr from 'ipaddr.js';

export class InspectionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function publicAddress(address: string): boolean {
  try {
    const ip = ipaddr.parse(address);
    return ip.range() === 'unicast' && (ip.kind() === 'ipv4' || ip.match(ipaddr.parse('2000::'), 3));
  } catch { return false; }
}

export function publicURL(value: string): URL {
  if (value.length > 4096) throw new InspectionError('URL is too long.');
  let url: URL;
  try { url = new URL(value); } catch { throw new InspectionError('Enter a complete HTTP or HTTPS URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new InspectionError('Use HTTP or HTTPS on the standard port, without embedded credentials.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Reject all literal addresses, including alternate numeric formats normalized by URL.
  if (ipaddr.isValid(host.replace(/^\[|\]$/g, '')) || !host.includes('.') ||
      /(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)) {
    throw new InspectionError('Only public internet hostnames are allowed.');
  }
  url.hostname = host;
  url.hash = '';
  return url;
}

export type Fetcher = typeof fetch;
export async function validateDNS(url: URL, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<void> {
  const results = await Promise.all(['A', 'AAAA'].map(async type => {
    const query = new URL('https://cloudflare-dns.com/dns-query');
    query.searchParams.set('name', url.hostname);
    query.searchParams.set('type', type);
    const response = await fetcher(query, { headers: { accept: 'application/dns-json' }, signal });
    if (!response.ok) throw new InspectionError('Public DNS lookup failed.', 502);
    const body = await readLimited(response, 32_768);
    const data = JSON.parse(body) as { Status: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0) throw new InspectionError('Hostname could not be resolved publicly.');
    return (data.Answer ?? []).filter(record => record.type === 1 || record.type === 28).map(record => record.data);
  }));
  const addresses = results.flat();
  if (!addresses.length || addresses.some(address => !publicAddress(address))) {
    throw new InspectionError('The hostname resolves to a private or reserved address.');
  }
}

export async function readBytes(response: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new InspectionError('Response exceeds the size limit.');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new InspectionError('Response exceeds the size limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return joined;
}

export async function fetchPublic(value: string, signal: AbortSignal, fetcher: Fetcher = fetch) {
  let url = publicURL(value);
  const redirects: { url: string; status: number; location: string }[] = [];
  for (let hop = 0; hop <= 5; hop++) {
    await validateDNS(url, signal, fetcher);
    // Fresh headers on every hop: never forward cookies, login tokens, or user headers.
    const response = await fetcher(url, {
      redirect: 'manual', signal, cache: 'no-store',
      headers: { 'user-agent': 'SharingDebugger/1.0', accept: 'text/html,application/xhtml+xml' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new InspectionError('Redirect has no destination.', 502);
      const next = publicURL(new URL(location, url).href);
      redirects.push({ url: url.href, status: response.status, location: next.href });
      url = next;
      continue;
    }
    return { response, url, redirects };
  }
  throw new InspectionError('Too many redirects (maximum five).');
}

export async function readLimited(response: Response, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBytes(response, maxBytes));
}
