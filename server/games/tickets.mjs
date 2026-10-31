import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export function ticketSecret(env=process.env){
  if(env.GAMES_TOKEN_SECRET)return env.GAMES_TOKEN_SECRET;
  if(env.SESSION_SECRET?.length>=32&&env.SITE_PASSWORD)return createHash('sha256').update(env.SESSION_SECRET+'\0'+env.SITE_PASSWORD+'\0asechka-games-v1').digest('hex');
  return undefined;
}

export function issueTicket(actor, secret, now = Date.now()) {
  if (!['asnat', 'youssef'].includes(actor) || typeof secret !== 'string' || secret.length < 32) throw new Error('Games authentication is not configured.');
  const payload = Buffer.from(JSON.stringify({ actor, exp: Math.floor(now / 1000) + 900, aud: 'asechka-games', jti: randomUUID() })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}

export function verifyTicket(ticket, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof ticket !== 'string' || ticket.length > 1024) throw new Error('Sign in again to play.');
  const parts = ticket.split('.');
  if (parts.length !== 2) throw new Error('Invalid games ticket.');
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const given = Buffer.from(parts[1], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('Invalid games ticket.');
  const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (value.aud !== 'asechka-games' || !['asnat', 'youssef'].includes(value.actor) || !Number.isInteger(value.exp) || value.exp <= now / 1000 || value.exp > now / 1000 + 901) throw new Error('Games ticket expired. Reconnect to play.');
  return value;
}
