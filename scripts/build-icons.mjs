// Builds public/icons.svg, a sprite of the Lucide icons the UI uses.
// Run `npm run icons` after changing the list.
import { readFileSync, writeFileSync } from 'node:fs';

const icons = ['arrow-up-right', 'link', 'monitor', 'sun', 'moon', 'circle-check', 'triangle-alert', 'chevron-down', 'download', 'image', 'facebook', 'twitter', 'search'];
const dir = new URL('../node_modules/lucide-static/icons/', import.meta.url);
const symbols = icons.map(name => {
  const svg = readFileSync(new URL(`${name}.svg`, dir), 'utf8');
  const body = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/\s+/g, ' ').trim();
  return `<symbol id="${name}" viewBox="0 0 24 24">${body}</symbol>`;
});
const version = JSON.parse(readFileSync(new URL('../package.json', dir), 'utf8')).version;
writeFileSync(new URL('../public/icons.svg', import.meta.url), `<!-- Lucide v${version} (ISC license), https://lucide.dev -->\n<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`);
