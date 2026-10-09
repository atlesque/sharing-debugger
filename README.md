# Sharing Debugger

A private, self-hosted sharing and SEO inspector built on Cloudflare Workers. Paste a public URL to inspect the HTML that crawlers receive, see illustrative Open Graph, Twitter, and search previews, and export the result as JSON.

## Features

- Titles, descriptions, canonical URLs, language, robots directives, and all meta tags
- Open Graph and Twitter tags, including repeated image tags
- JSON-LD, headings, link relationships, and alternate languages
- HTTP status, relevant response headers, redirect chain, and fresh fetch timestamps
- Missing and conflicting metadata warnings
- Optional image previews fetched through the same public-destination checks
- Cloudflare Access login with a single configured email, enforced again inside the Worker

The inspector reads server-delivered HTML. It does not execute JavaScript, refresh Facebook's cache, or reproduce each platform's rendering algorithm. Pages behind authentication or bot challenges may not be inspectable. Share images are loaded only when requested.

## Requirements

Node.js 24+, a Cloudflare account, a domain managed by Cloudflare, and Cloudflare Zero Trust/Access configured with an identity provider (email one-time PIN is sufficient).

## Set up your own instance

1. Clone this repository and run `npm ci`.
2. Sign in with `npx wrangler login`, or set a suitably scoped `CLOUDFLARE_API_TOKEN` locally. Never commit it.
3. In Cloudflare Zero Trust, create a self-hosted Access application for your exact hostname, covering all paths. Attach a reusable **Allow** policy that includes only your email address. Do not attach Bypass, Everyone, email-domain, or service-token policies. Access denies all unmatched users.
4. Choose your identity provider. Copy the application's audience (AUD) and your team's HTTPS domain from Access settings.
5. Copy `.env.example` to `.env.local` and fill in your account ID, hostname, team domain, audience, and allowed email.
6. Run `npm run types`, `npm run check`, and `npm test`.
7. Run `npm run deploy -- --dry-run`, then `npm run deploy`. The deployment script generates an ignored `wrangler.deploy.json`, attaches the custom domain, and disables workers.dev and preview URLs.
8. Visit the hostname and sign in. Test a public page, a private address, and the unauthenticated URL in a separate browser session.

Configure Access **before** connecting the hostname. The Worker denies every request when Access settings are absent or invalid, including static assets. No production authentication bypass exists.

The public Wrangler configuration contains no account IDs, real domains, email addresses, or credentials. Keep `.env.local`, `.dev.vars`, `.local/`, generated deployment configuration, test exports, and screenshots out of Git. Tokens used for deployment are never Worker bindings.

## Local development and verification

`npm run dev` runs the real Worker in the local Cloudflare runtime. It intentionally returns 403 until supplied with valid Access configuration and a valid signed assertion for that application. For authenticated testing, use a protected deployment rather than disabling authentication. Unit tests generate their own ephemeral signing keys and verify accepted and rejected identities without production credentials.

```sh
npm run types
npm run check
npm test
npm run build
```

GitHub Actions performs these checks without Cloudflare credentials. Deployment is manual so a fork can choose its own account and settings.

## Security and privacy

Only HTTP and HTTPS on their standard ports are accepted. Credentials in URLs and all literal IP addresses are rejected. Each hostname and redirect must resolve publicly, with every returned A/AAAA address checked against private and reserved ranges. Redirects are followed manually (at most five), with fresh crawler-only headers; cookies, Access assertions, and user headers are never forwarded.

HTML and image responses are capped at 2 MB, DNS responses at 32 KB, and inspection requests at 8 KB. Inspections time out after 15 seconds; images after 10 seconds. Cloudflare's rate-limit binding caps each operation at 20 requests per minute per location. Images are restricted to raster formats; SVG and arbitrary HTML are not served as images.

Access JWTs must have a valid RS256 signature, issuer, audience, expiry, and the configured email. API POSTs require a matching Origin and JSON content type. Results use `no-store`, a restrictive content security policy, and text-only DOM insertion. The application stores no inspection history and avoids logging inspected URLs, metadata, login tokens, or emails. Cloudflare infrastructure can still produce operational records; review your account's logging and retention settings.

DNS checks are defense in depth, not a pinned connection: the subsequent fetch uses Cloudflare's resolver. Deploy this fetcher only on Workers without private-network bindings. Porting it to a server with private-network access requires connection-level IP pinning and egress controls to prevent DNS rebinding. Cloudflare fetch behavior and destination restrictions also apply, so some otherwise public hosts may fail.

## Configuration

| Variable | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Account used for deployment |
| `APP_DOMAIN` | Custom hostname, without scheme or path |
| `ACCESS_TEAM_DOMAIN` | HTTPS origin of your Access team |
| `ACCESS_AUD` | Audience of the Access application |
| `ALLOWED_EMAIL` | The single permitted identity |
| `CLOUDFLARE_API_TOKEN` | Optional deployment credential; local only |

`npm run deploy` reads `.env.local`; environment variables take precedence. Re-run it after configuration changes. To retire the instance, remove its custom-domain route and Worker, then remove only its dedicated Access application and any unused dedicated policy.

## License

MIT.

Useful Cloudflare documentation: [validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), and [Worker-first asset routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/).
