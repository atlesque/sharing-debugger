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
function preview(data, url, search = false) {
  const card = node('div', undefined, search ? 'card search' : 'card');
  if (!search) {
    const slot = node('div', undefined, 'image-slot');
    slot.append(icon('image'), node('span', data.image ? 'Share image found' : 'No share image'));
    if (data.image) {
      const button = node('button', 'Load image'); button.type = 'button';
      button.addEventListener('click', () => {
        button.disabled = true; button.textContent = 'Loading…';
        const img = node('img'); img.alt = 'Share card image';
        img.onload = () => slot.replaceChildren(img);
        img.onerror = () => slot.replaceChildren(icon('image'), node('span', 'Image could not be loaded'));
        img.src = '/api/image?url=' + encodeURIComponent(data.image);
      });
      slot.append(button);
    }
    card.append(slot);
  }
  const body = node('div', undefined, 'card-body');
  let hostname; try { hostname = new URL(url).hostname; } catch { hostname = url; }
  body.append(node('span', hostname, 'card-host'), node('h3', data.title || '(No title)'), node('p', data.description || '(No description)'));
  card.append(body); return card;
}
function render(data) {
  report = data;
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
$('inspect-form').addEventListener('submit', async event => {
  event.preventDefault(); $('error').hidden = true; $('loading').hidden = false; $('submit').disabled = true; $('results').hidden = true;
  try {
    const response = await fetch('/api/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: $('url').value.trim() }) });
    if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Your login has expired. Reload the page to sign in again.');
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Inspection failed.'); render(data);
  } catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
  finally { $('loading').hidden = true; $('submit').disabled = false; }
});
$('download').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const anchor = node('a'); anchor.href = url; anchor.download = 'sharing-inspection.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
