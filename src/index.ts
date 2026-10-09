import { authorized } from './auth';
import { extractMetadata } from './metadata';
import { fetchPublic, InspectionError, readLimited, readBytes } from './security';

const securityHeaders = {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
function secure(response: Response, cacheControl = 'no-store') {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(securityHeaders)) result.headers.set(key, value);
  result.headers.set('cache-control', cacheControl);
  return result;
}
export default {
  async fetch(request: Request, env: Env) {
    if (!await authorized(request, env)) return secure(Response.json({ error: 'Sign in through Cloudflare Access to use this application.' }, { status: 403 }));
    const url = new URL(request.url);
    if (url.pathname === '/api/image') {
      if (request.method !== 'GET' || request.headers.get('sec-fetch-site') !== 'same-origin') return secure(new Response('Forbidden', { status: 403 }));
      if (!(await env.INSPECT_LIMITER.limit({ key: 'images' })).success) return secure(new Response('Rate limited', { status: 429 }));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const { response } = await fetchPublic(url.searchParams.get('url') || '', controller.signal);
        const type = response.headers.get('content-type')?.split(';')[0].toLowerCase() || '';
        if (!response.ok || !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(type)) {
          await response.body?.cancel(); throw new InspectionError('Unsupported image.');
        }
        return secure(new Response(await readBytes(response, 2_000_000), { headers: { 'content-type': type } }), 'private, max-age=600');
      } catch { return secure(new Response('Image could not be loaded', { status: 400 })); }
      finally { clearTimeout(timer); }
    }
    if (url.pathname !== '/api/inspect') {
      if (!['GET', 'HEAD'].includes(request.method)) return secure(new Response('Method not allowed', { status: 405 }));
      return secure(await env.ASSETS.fetch(request));
    }
    if (request.method !== 'POST') return secure(new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } }));
    if (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json')) {
      return secure(Response.json({ error: 'A same-origin JSON request is required.' }, { status: 403 }));
    }
    if (!(await env.INSPECT_LIMITER.limit({ key: 'inspections' })).success) return secure(Response.json({ error: 'Too many inspections. Try again in a minute.' }, { status: 429 }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const started = Date.now();
    try {
      const body = JSON.parse(await readLimited(new Response(request.body, { headers: request.headers }), 8192)) as { url?: unknown };
      if (typeof body.url !== 'string') throw new InspectionError('Provide a URL.');
      const { response, url: finalURL, redirects } = await fetchPublic(body.url, controller.signal);
      const contentType = response.headers.get('content-type') || '';
      if (!/^text\/html\b|^application\/xhtml\+xml\b/i.test(contentType)) {
        await response.body?.cancel();
        throw new InspectionError('The URL did not return an HTML page.');
      }
      const html = await readLimited(response, 2_000_000);
      const metadata = extractMetadata(html, finalURL.href);
      if (!response.ok) metadata.warnings.unshift(`The page returned HTTP ${response.status}.`);
      const headers: Record<string, string> = {};
      for (const name of ['content-type', 'content-language', 'x-robots-tag', 'link', 'cache-control', 'last-modified', 'etag']) {
        const value = response.headers.get(name); if (value) headers[name] = value;
      }
      if (/noindex/i.test(headers['x-robots-tag'] || '')) metadata.warnings.push('X-Robots-Tag prevents indexing.');
      return secure(Response.json({ requestedURL: body.url, finalURL: finalURL.href, status: response.status, redirects, headers, inspectedAt: new Date().toISOString(), durationMs: Date.now() - started, ...metadata }));
    } catch (error) {
      const message = controller.signal.aborted ? 'The inspection timed out after 15 seconds.' : error instanceof InspectionError ? error.message : error instanceof SyntaxError ? 'Invalid request data.' : 'The page could not be fetched.';
      console.log(JSON.stringify({ event: 'inspection_failed', category: controller.signal.aborted ? 'timeout' : error instanceof InspectionError ? 'validation' : 'upstream' }));
      return secure(Response.json({ error: message }, { status: error instanceof InspectionError ? error.status : controller.signal.aborted ? 504 : 502 }));
    } finally { clearTimeout(timer); }
  },
} satisfies ExportedHandler<Env>;
