import { z } from 'zod';
import { timestampSchema } from './primitives.js';

export const wsErrorCodeSchema = z.enum([
  'invalid_message',
  'unauthorized',
  'not_implemented',
  'rate_limited',
  'internal',
]);
export type WsErrorCode = z.infer<typeof wsErrorCodeSchema>;

export const wsPingSchema = z.object({ type: z.literal('ping') });
export const wsPongSchema = z.object({ type: z.literal('pong'), ts: timestampSchema });
export const wsErrorSchema = z.object({
  type: z.literal('error'),
  code: wsErrorCodeSchema,
  message: z.string(),
});
export type WsError = z.infer<typeof wsErrorSchema>;

/**
 * Parsea un mensaje de texto de WebSocket contra un esquema.
 * Devuelve `null` si no es JSON o no cumple el contrato.
 */
export function parseWsMessage<T>(schema: z.ZodType<T>, raw: string): T | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : null;
}
