import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const claimsSchema = z.object({
  userId: z.uuid(),
  accountId: z.uuid(),
  /** Vencimiento, en milisegundos desde epoch. */
  expiresAt: z.number().int().positive(),
});
export type TokenClaims = z.infer<typeof claimsSchema>;

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

/** Token de sesión: `payload.firma`, ambos en base64url. Firmado con HMAC-SHA256. */
export function signToken(claims: TokenClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

/** Devuelve los datos del token, o `null` si la firma no coincide, está mal formado o venció. */
export function verifyToken(token: string, secret: string, now: number): TokenClaims | null {
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length > 0) return null;

  const expected = sign(payload, secret);
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const claims = claimsSchema.safeParse(json);
  if (!claims.success || claims.data.expiresAt <= now) return null;
  return claims.data;
}
