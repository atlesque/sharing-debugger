import { load } from 'cheerio';

export function extractMetadata(html: string, finalURL: string) {
  const $ = load(html);
  const meta: { key: string; content: string }[] = [];
  $('meta').each((_, el) => {
    meta.push({ key: $(el).attr('property') || $(el).attr('name') || $(el).attr('http-equiv') || ($(el).attr('charset') ? 'charset' : '(unnamed)'), content: $(el).attr('content') || $(el).attr('charset') || '' });
  });
  const first = (key: string) => meta.find(item => item.key.toLowerCase() === key)?.content || '';
  let baseURL = finalURL;
  try {
    const base = new URL($('base[href]').first().attr('href') || finalURL, finalURL);
    if (['https:', 'http:'].includes(base.protocol) && !base.username && !base.password) baseURL = base.href;
  } catch { /* Invalid base elements are ignored. */ }
  const resolve = (value: string) => {
    if (!value.trim()) return '';
    try { const url = new URL(value, baseURL); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  };
  const links: { rel: string; href: string; hreflang: string; type: string }[] = [];
  $('link').each((_, el) => { links.push({ rel: $(el).attr('rel') || '', href: resolve($(el).attr('href') || ''), hreflang: $(el).attr('hreflang') || '', type: $(el).attr('type') || '' }); });
  const structuredData: { valid: boolean; data?: unknown; raw?: string }[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    try { structuredData.push({ valid: true, data: JSON.parse(raw) }); }
    catch { structuredData.push({ valid: false, raw }); }
  });
  const title = $('title').first().text().trim();
  const description = first('description');
  const canonical = links.find(link => link.rel.toLowerCase().split(/\s+/).includes('canonical'))?.href || '';
  const headings: { level: string; text: string }[] = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => { if (headings.length < 100) headings.push({ level: el.tagName, text: $(el).text().trim().slice(0, 500) }); });
  const warnings: string[] = [];
  if (!title) warnings.push('Missing page title.');
  if (!description) warnings.push('Missing meta description.');
  for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) if (!first(key)) warnings.push(`Missing ${key}.`);
  if (!canonical) warnings.push('Missing canonical URL.');
  if (!first('twitter:card')) warnings.push('Missing twitter:card.');
  if (meta.some(item => /robots|bot$/i.test(item.key) && /noindex/i.test(item.content))) warnings.push('A robots directive prevents indexing.');
  if (structuredData.some(item => !item.valid)) warnings.push('Invalid JSON-LD structured data.');
  for (const key of new Set(meta.map(item => item.key.toLowerCase()))) {
    if (meta.filter(item => item.key.toLowerCase() === key).length > 1 && !/^(og:image|og:video|og:audio)/.test(key)) warnings.push(`Multiple ${key} tags; crawlers may choose different values.`);
  }
  return {
    title, description, canonical, language: $('html').attr('lang') || '',
    robots: first('robots'), openGraph: meta.filter(item => item.key.startsWith('og:')),
    twitter: meta.filter(item => item.key.startsWith('twitter:')),
    meta, links, structuredData, headings, warnings,
    images: meta.filter(item => item.key === 'og:image' || item.key === 'og:image:url' || item.key === 'twitter:image').map(item => resolve(item.content)).filter(Boolean),
    previews: {
      social: { title: first('og:title') || title, description: first('og:description') || description, image: resolve(first('og:image') || first('og:image:url') || ''), url: resolve(first('og:url') || finalURL), siteName: first('og:site_name') },
      twitter: { title: first('twitter:title') || first('og:title') || title, description: first('twitter:description') || first('og:description') || description, image: resolve(first('twitter:image') || first('og:image') || ''), card: first('twitter:card') },
      search: { title, description, url: canonical || finalURL },
    },
  };
}
