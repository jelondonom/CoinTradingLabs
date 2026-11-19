import { z } from 'zod';
import { idSchema, timestampSchema } from './primitives.js';

/**
 * Sesión por código de inscripción (D-04). El servidor responde con una cookie `httpOnly`;
 * el token nunca viaja en el cuerpo ni se guarda en `localStorage`.
 * Rutas del servidor `api`; el navegador las llama con el prefijo `/api` (ADR-0004).
 */
export const LOGIN_PATH = '/auth/login';
export const LOGOUT_PATH = '/auth/logout';

/**
 * Cookie de sesión: `HttpOnly`, `SameSite=Strict`, `Path=/` y `Secure` en staging y producción
 * (HTTPS). En desarrollo, sobre `http://localhost`, va sin `Secure`: WebKit la descartaría.
 * Un solo origen (Caddy en producción, Vite en desarrollo), así que la cookie también viaja en el
 * WS de cuenta.
 */
export const SESSION_COOKIE_NAME = 'coin_session';

/** Cuerpo de `POST /auth/login`. El código no distingue mayúsculas, espacios ni guiones. */
export const loginRequestSchema = z.object({ code: z.string().trim().min(4).max(64) });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Respuesta 200 de `POST /auth/login`, junto con la cabecera `Set-Cookie`. */
export const loginResponseSchema = z.object({
  accountId: idSchema,
  /** Vencimiento de la sesión. */
  expiresAt: timestampSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
