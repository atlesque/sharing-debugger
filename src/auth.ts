import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export async function authorized(request: Request, env: Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD' | 'ALLOWED_EMAIL'>, key?: JWTVerifyGetKey): Promise<boolean> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) return false;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return false;
  try {
    const issuer = new URL(env.ACCESS_TEAM_DOMAIN);
    if (issuer.protocol !== 'https:' || !issuer.hostname.endsWith('.cloudflareaccess.com')) return false;
    const { payload } = await jwtVerify(token, key || createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), { timeoutDuration: 5000 }), {
      issuer: issuer.origin, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email'],
    });
    return typeof payload.email === 'string' && payload.email.toLowerCase() === env.ALLOWED_EMAIL.toLowerCase();
  } catch { return false; }
}
