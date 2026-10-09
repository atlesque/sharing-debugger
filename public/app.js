const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
let report;
function table(rows) {
  const el = node('table');
  for (const [key, value] of rows) { const tr = node('tr'); tr.append(node('td', key), node('td', String(value || '—'))); el.append(tr); }
  return el;
}
function detail(title, content) { const el = node('details'); el.append(node('summary', title), content); return el; }
function preview(label, data, url, search = false) {
  const wrap = node('div', undefined, search ? 'search' : ''); wrap.append(node('p', label, 'preview-label'));
  const card = node('div', undefined, 'card');
  if (!search) {
    const slot = node('div', undefined, 'image-slot');
    slot.append(node('span', data.image ? 'Share image found' : 'No share image found'));
    if (data.image) {
      const button = node('button', 'Load image preview'); button.type = 'button';
      button.addEventListener('click', () => {
        button.disabled = true; button.textContent = 'Loading…';
        const img = node('img'); img.alt = 'Share card image';
        img.onload = () => slot.replaceChildren(img);
        img.onerror = () => slot.replaceChildren(node('span', 'Image could not be loaded'));
        img.src = '/api/image?url=' + encodeURIComponent(data.image);
      });
      slot.append(button);
    }
    card.append(slot);
  }
  const body = node('div', undefined, 'card-body');
  let hostname; try { hostname = new URL(url).hostname; } catch { hostname = url; }
  body.append(node('span', hostname, 'card-host'), node('h3', data.title || '(No title)'), node('p', data.description || '(No description)'));
  card.append(body); wrap.append(card); return wrap;
}
function render(data) {
  report = data;
  $('empty').hidden = true; $('results').hidden = false;
  $('result-title').textContent = data.title || 'Untitled page'; $('result-url').textContent = data.finalURL;
  $('summary').replaceChildren(...[`HTTP ${data.status}`, `${data.durationMs} ms`, `${data.redirects.length} redirects`, `${data.meta.length} meta tags`, new Date(data.inspectedAt).toLocaleTimeString()].map(text => node('span', text, 'badge')));
  $('previews').replaceChildren(preview('Facebook / Open Graph', data.previews.social, data.finalURL), preview('X / Twitter', data.previews.twitter, data.finalURL), preview('Search result', data.previews.search, data.previews.search.url, true));
  $('warning-count').textContent = data.warnings.length;
  $('warnings').replaceChildren(...(data.warnings.length ? data.warnings : ['Core share metadata is present.']).map(text => node('li', text)));
  const structured = node('pre', JSON.stringify(data.structuredData, null, 2));
  $('details').replaceChildren(
    detail('Page & search metadata', table([['Title', data.title], ['Description', data.description], ['Canonical', data.canonical], ['Language', data.language], ['Robots', data.robots]])),
    detail(`Open Graph (${data.openGraph.length})`, table(data.openGraph.map(item => [item.key, item.content]))),
    detail(`Twitter cards (${data.twitter.length})`, table(data.twitter.map(item => [item.key, item.content]))),
    detail(`All meta tags (${data.meta.length})`, table(data.meta.map(item => [item.key, item.content]))),
    detail(`Links & alternate languages (${data.links.length})`, table(data.links.map(item => [item.rel + (item.hreflang ? ` (${item.hreflang})` : ''), item.href]))),
    detail(`Structured data (${data.structuredData.length})`, structured),
    detail(`Headings (${data.headings.length})`, table(data.headings.map(item => [item.level, item.text]))),
    detail('HTTP headers', table(Object.entries(data.headers))),
    detail('Redirect chain', table(data.redirects.map(item => [`${item.status} ${item.url}`, item.location]))),
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
