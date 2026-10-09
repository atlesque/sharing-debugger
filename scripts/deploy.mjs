import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
const local = parseEnv(await readFile('.env.local', 'utf8'));
const settings = { ...local, ...process.env };
for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'APP_DOMAIN', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'ALLOWED_EMAIL']) {
  if (!settings[key]) throw new Error(`Set ${key} in .env.local (see .env.example).`);
}
const host = new URL(`https://${settings.APP_DOMAIN}`);
if (host.host !== settings.APP_DOMAIN || host.pathname !== '/') throw new Error('APP_DOMAIN must be a hostname.');
const issuer = new URL(settings.ACCESS_TEAM_DOMAIN);
if (issuer.protocol !== 'https:' || !issuer.hostname.endsWith('.cloudflareaccess.com') || issuer.origin !== settings.ACCESS_TEAM_DOMAIN) throw new Error('ACCESS_TEAM_DOMAIN must be your HTTPS Access team origin.');
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.account_id = settings.CLOUDFLARE_ACCOUNT_ID;
config.routes = [{ pattern: settings.APP_DOMAIN, custom_domain: true }];
config.vars = Object.fromEntries(['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'ALLOWED_EMAIL'].map(key => [key, settings[key]]));
await writeFile('wrangler.deploy.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
const result = spawnSync('npx', ['wrangler', 'deploy', '--config', 'wrangler.deploy.json', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...local, ...process.env } });
process.exit(result.status ?? 1);
