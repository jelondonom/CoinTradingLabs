/**
 * Arma la API real (`buildApp` de `apps/api`) para las pruebas de `tests/security/`, con reloj
 * fijo, secreto de prueba y límites de peticiones que ninguna prueba alcanza. Se importa por ruta
 * relativa, como el motor en `tests/properties/`, y nunca se modifica.
 */
import { DEFAULT_STALE_AFTER_MS, SESSION_COOKIE_NAME } from '@coin/shared';
import { buildApp } from '../../apps/api/src/app.js';
import type { Db } from '../../apps/api/src/db/prisma.js';
import { signToken } from '../../apps/api/src/modules/auth/token.js';
import { AccountQueue } from '../../apps/api/src/modules/orders/account-queue.js';
import { MemoryTickSource } from '../../apps/api/src/modules/orders/tick-source.js';
import { MemoryCounterStore } from '../../apps/api/src/modules/rate-limit/counter-store.js';
import {
  RateLimiter,
  TradingRateLimits,
} from '../../apps/api/src/modules/rate-limit/rate-limiter.js';

export type Api = Awaited<ReturnType<typeof buildApp>>;

/** Hora fija del servidor en estas pruebas. */
export const NOW = 1_800_000_000_000;
const SECRET = 'secreto-de-prueba-de-qa-con-mas-de-32-caracteres';
const SESSION_MS = 60 * 60 * 1000;

/** Límites de D-13 que ninguna prueba alcanza: aquí se prueba la validación, no los límites. */
function unreachableRateLimits(): TradingRateLimits {
  const huge = 1_000_000_000;
  return new TradingRateLimits(
    new RateLimiter(
      new MemoryCounterStore(),
      () => NOW,
      () => {},
    ),
    {
      loginFailuresPer15Min: huge,
      ordersPerMinute: huge,
      ordersPerDay: huge,
    },
  );
}

/** La API real con la base y los precios que reciba. */
export function startApi(db: Db, ticks = new MemoryTickSource()): Promise<Api> {
  return buildApp({
    checks: {},
    trading: {
      db,
      ticks,
      queue: new AccountQueue(),
      now: () => NOW,
      staleAfterMs: DEFAULT_STALE_AFTER_MS,
      tokenSecret: SECRET,
      tokenTtlMs: SESSION_MS,
      rateLimits: unreachableRateLimits(),
    },
  });
}

export type SessionHeaders = { authorization: string; cookie: string };

/**
 * Cabeceras de una sesión válida para la cuenta. El mismo token firmado va en las dos formas que
 * acepta o aceptará la API: `Authorization: Bearer` (hoy) y la cookie `coin_session` del login por
 * cookie (D-04). La API usa una e ignora la otra, así que estas pruebas sobreviven al cambio.
 */
export function sessionHeaders(accountId: string, userId: string): SessionHeaders {
  const token = signToken({ userId, accountId, expiresAt: NOW + SESSION_MS }, SECRET);
  return { authorization: `Bearer ${token}`, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

/**
 * Base de datos falsa que anota cada acceso y lo corta con un error. Si una ruta llega a tocarla,
 * el cuerpo ya pasó la validación; la respuesta de esa petición es un 500 que no significa nada.
 */
export function trackingDb(): { db: Db; touched: string[] } {
  const touched: string[] = [];
  const db = new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== 'string' || property === 'then') return undefined;
        touched.push(property);
        throw new Error(`La prueba cortó el acceso a la base (${property}).`);
      },
    },
  );
  return { db: db as Db, touched };
}
