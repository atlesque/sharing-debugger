const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
const SVG = 'http://www.w3.org/2000/svg';
function icon(name) {
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG, 'use'); use.setAttribute('href', '/icons.svg#' + name); svg.append(use); return svg;
}
let report;

// Theme: auto follows the system; light and dark are saved.
const themeButtons = document.querySelectorAll('[data-theme-option]');
function showTheme(theme) { for (const button of themeButtons) button.setAttribute('aria-checked', String(button.dataset.themeOption === theme)); }
let savedTheme = 'auto'; try { savedTheme = localStorage.getItem('theme') || 'auto'; } catch {}
showTheme(savedTheme);
for (const button of themeButtons) button.addEventListener('click', () => {
  const theme = button.dataset.themeOption;
  if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  try { theme === 'auto' ? localStorage.removeItem('theme') : localStorage.setItem('theme', theme); } catch {}
  showTheme(theme);
});

// Preview tabs
const tabs = [...document.querySelectorAll('[role=tab]')];
function selectTab(tab) {
  for (const other of tabs) {
    const selected = other === tab;
    other.setAttribute('aria-selected', String(selected)); other.tabIndex = selected ? 0 : -1;
    $(other.getAttribute('aria-controls')).hidden = !selected;
  }
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]; if (!step) return;
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length]; selectTab(next); next.focus(); event.preventDefault();
  });
}

function table(rows) {
  const el = node('table');
  for (const [key, value] of rows) { const tr = node('tr'); tr.append(node('td', key), node('td', String(value || '—'))); el.append(tr); }
  return el;
}
function section(title, content) { const el = node('section', undefined, 'hood-section'); el.append(node('h4', title), content); return el; }
// Share images load on their own; each URL is fetched once and shared by every card that shows it.
const images = new Map();
function loadImage(src) {
  if (!images.has(src)) images.set(src, new Promise((resolve, reject) => {
    const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = '/api/image?url=' + encodeURIComponent(src);
  }));
  return images.get(src);
}
function preview(data, url, search = false) {
  const card = node('div', undefined, search ? 'card search' : 'card');
  if (!search) {
    const slot = node('div', undefined, 'image-slot');
    if (data.image) {
      slot.classList.add('loading'); slot.setAttribute('aria-busy', 'true'); slot.setAttribute('aria-label', 'Loading share image');
      loadImage(data.image).then(() => {
        const img = node('img'); img.alt = 'Share card image'; img.src = '/api/image?url=' + encodeURIComponent(data.image);
        slot.replaceChildren(img);
      }, () => slot.replaceChildren(icon('image'), node('span', 'Image could not be loaded'))).finally(() => {
        slot.classList.remove('loading'); slot.removeAttribute('aria-busy'); slot.removeAttribute('aria-label');
      });
    } else slot.append(icon('image'), node('span', 'No share image'));
    card.append(slot);
  }
  const body = node('div', undefined, 'card-body');
  let hostname; try { hostname = new URL(url).hostname; } catch { hostname = url; }
  body.append(node('span', hostname, 'card-host'), node('h3', data.title || '(No title)'), node('p', data.description || '(No description)'));
  card.append(body); return card;
}
// A prompt a coding agent can act on: the page, every issue with how to fix it, and the tags the page has now.
const fixes = [
  [/^Missing page title/, 'Add a <title> of about 50 to 60 characters that describes this page.'],
  [/^Missing meta description/, 'Add <meta name="description" content="…"> with a 120 to 160 character summary of this page.'],
  [/^Missing og:title/, 'Add <meta property="og:title" content="…">, usually the page title without the site name suffix.'],
  [/^Missing og:description/, 'Add <meta property="og:description" content="…">, one or two sentences; the meta description is a good default.'],
  [/^Missing og:image/, 'Add <meta property="og:image" content="https://…"> with an absolute URL to a 1200×630 PNG or JPG under 5 MB, plus og:image:width, og:image:height and og:image:alt. Use an existing hero or brand image if the project has one; if not, say so instead of inventing one.'],
  [/^Missing og:url/, 'Add <meta property="og:url" content="…"> with the absolute canonical URL of this page.'],
  [/^Missing canonical/, 'Add <link rel="canonical" href="…"> with the absolute, preferred URL of this page.'],
  [/^Missing twitter:card/, 'Add <meta name="twitter:card" content="summary_large_image"> (or "summary" if the page has no share image). X falls back to the og: tags for title, description and image.'],
  [/^A robots directive/, 'A robots meta tag contains noindex. Remove it unless this page is meant to stay out of search results.'],
  [/^X-Robots-Tag/, 'The server sends an X-Robots-Tag header with noindex. Remove it from the server or hosting config unless this page is meant to stay out of search results.'],
  [/^Invalid JSON-LD/, 'Fix the syntax of the <script type="application/ld+json"> block that does not parse as JSON (shown below).'],
  [/^Multiple /, 'Keep only one of these tags so every crawler reads the same value.'],
  [/^The page returned HTTP/, 'Make the page return HTTP 200; crawlers may not show a preview for error responses.'],
];
function agentPrompt(data) {
  const lines = [
    'Fix the missing and broken link-preview metadata (Open Graph, Twitter/X card and SEO tags) for this page in this codebase.',
    '',
    `Page: ${data.finalURL}`,
  ];
  if (data.requestedURL && data.requestedURL !== data.finalURL) lines.push(`Requested as: ${data.requestedURL} (redirected)`);
  lines.push('', '## Issues to fix', '');
  data.warnings.forEach((warning, index) => {
    const fix = fixes.find(([pattern]) => pattern.test(warning))?.[1];
    lines.push(`${index + 1}. ${warning}${fix ? ` ${fix}` : ''}`);
  });
  const value = text => text ? `"${text}"` : '(none)';
  lines.push('', '## What the page has now', '',
    `- Title: ${value(data.title)}`,
    `- Meta description: ${value(data.description)}`,
    `- Canonical: ${value(data.canonical)}`,
    `- Language: ${value(data.language)}`);
  const h1 = data.headings.find(item => item.level === 'h1');
  if (h1) lines.push(`- First h1: ${value(h1.text)}`);
  for (const item of [...data.openGraph, ...data.twitter]) lines.push(`- ${item.key}: ${value(item.content)}`);
  const invalid = data.structuredData.filter(item => !item.valid);
  if (invalid.length) lines.push('', 'JSON-LD that does not parse:', ...invalid.map(item => '```\n' + (item.raw || '').trim().slice(0, 2000) + '\n```'));
  lines.push('', '## How to fix', '',
    '- Find where this page\'s <head> is rendered (layout, template, framework metadata API or SEO component) and add the tags there, so every page using it gets them. Prefer page-specific values where the framework supports them.',
    '- Base the new text on the page\'s existing title, description and content. Do not invent facts.',
    '- Use absolute https URLs for og:url, og:image and the canonical link.',
    '- Do not remove or change tags that are already correct.',
    '- When you are done, list what you changed and anything you could not fix.');
  return lines.join('\n');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch {}
  const area = node('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.append(area); area.select();
  try { if (!document.execCommand('copy')) throw new Error('Copy failed'); } finally { area.remove(); }
}
function copyPromptButton(data) {
  const button = node('button', undefined, 'copy-prompt'); button.type = 'button';
  const label = node('span', 'Copy agent prompt');
  button.title = 'Copy a prompt for a coding agent to fix these issues';
  button.append(icon('copy'), label);
  let timer;
  button.addEventListener('click', async () => {
    clearTimeout(timer);
    try { await copyText(agentPrompt(data)); button.replaceChildren(icon('check'), label); label.textContent = 'Copied'; }
    catch { label.textContent = 'Copy failed'; }
    timer = setTimeout(() => { button.replaceChildren(icon('copy'), label); label.textContent = 'Copy agent prompt'; }, 2000);
  });
  return button;
}
function render(data) {
  report = data; images.clear();
  $('results').hidden = false;
  $('result-title').textContent = data.title || 'Untitled page'; $('result-url').textContent = data.finalURL;
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  $('summary').replaceChildren(
    node('span', `HTTP ${data.status}`, data.status >= 200 && data.status < 300 ? 'badge ok' : 'badge warn'),
    ...[`${data.durationMs} ms`, plural(data.redirects.length, 'redirect'), plural(data.meta.length, 'meta tag'), new Date(data.inspectedAt).toLocaleTimeString()].map(text => node('span', text, 'badge')),
  );
  $('panel-facebook').replaceChildren(preview(data.previews.social, data.finalURL));
  $('panel-x').replaceChildren(preview(data.previews.twitter, data.finalURL));
  $('panel-search').replaceChildren(preview(data.previews.search, data.previews.search.url, true));
  selectTab(tabs[0]);

  const ok = !data.warnings.length;
  const head = node('div', undefined, 'checks-head');
  head.append(icon(ok ? 'circle-check' : 'triangle-alert'), node('strong', ok ? 'All share metadata present' : `${data.warnings.length} ${data.warnings.length === 1 ? 'issue' : 'issues'} to fix`));
  if (!ok) head.append(copyPromptButton(data));
  const checks = $('checks'); checks.className = ok ? 'checks ok' : 'checks warn'; checks.replaceChildren(head);
  if (!ok) { const list = node('ul'); list.append(...data.warnings.map(text => node('li', text))); checks.append(list); }

  $('details').replaceChildren(
    section('Page & search', table([['Title', data.title], ['Description', data.description], ['Canonical', data.canonical], ['Language', data.language], ['Robots', data.robots]])),
    section(`Open Graph (${data.openGraph.length})`, table(data.openGraph.map(item => [item.key, item.content]))),
    section(`Twitter cards (${data.twitter.length})`, table(data.twitter.map(item => [item.key, item.content]))),
    section(`All meta tags (${data.meta.length})`, table(data.meta.map(item => [item.key, item.content]))),
    section(`Links & alternates (${data.links.length})`, table(data.links.map(item => [item.rel + (item.hreflang ? ` (${item.hreflang})` : ''), item.href]))),
    section(`Structured data (${data.structuredData.length})`, node('pre', JSON.stringify(data.structuredData, null, 2))),
    section(`Headings (${data.headings.length})`, table(data.headings.map(item => [item.level, item.text]))),
    section('HTTP headers', table(Object.entries(data.headers))),
    section('Redirect chain', table(data.redirects.map(item => [`${item.status} ${item.url}`, item.location]))),
  );
}
let latest = 0;
async function inspect(url) {
  const current = ++latest;
  $('error').hidden = true; $('loading').hidden = false; $('submit').disabled = true; $('results').hidden = true;
  try {
    const response = await fetch('/api/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Your login has expired. Reload the page to sign in again.');
    const data = await response.json(); if (current !== latest) return; if (!response.ok) throw new Error(data.error || 'Inspection failed.'); render(data);
  } catch (error) { if (current === latest) { $('error').textContent = error.message; $('error').hidden = false; } }
  finally { if (current === latest) { $('loading').hidden = true; $('submit').disabled = false; } }
}
function sharedURL() { return new URLSearchParams(location.search).get('url')?.trim() || ''; }
function inspectShared() { const url = sharedURL(); if (!url) return; $('url').value = url; inspect(url); }
$('inspect-form').addEventListener('submit', event => {
  event.preventDefault();
  const url = $('url').value.trim();
  if (url !== sharedURL()) { const next = new URL(location.href); next.searchParams.set('url', url); history.pushState(null, '', next); }
  inspect(url);
});
window.addEventListener('popstate', () => { if (sharedURL()) inspectShared(); else { latest++; $('loading').hidden = true; $('submit').disabled = false; $('url').value = ''; $('results').hidden = true; $('error').hidden = true; } });
inspectShared();
$('download').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const anchor = node('a'); anchor.href = url; anchor.download = 'sharing-inspection.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
