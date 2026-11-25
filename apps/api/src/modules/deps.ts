import type { Db } from '../db/prisma.js';
import type { AccountQueue } from './orders/account-queue.js';
import type { TickSource } from './orders/tick-source.js';
import type { TradingRateLimits } from './rate-limit/rate-limiter.js';

/** Dependencias de los módulos de trading. Se inyectan para poder probarlos. */
export type TradingDeps = {
  db: Db;
  ticks: TickSource;
  queue: AccountQueue;
  /** Hora del servidor, en milisegundos desde epoch. */
  now: () => number;
  tokenSecret: string;
  /** Duración de la sesión. */
  tokenTtlMs: number;
  /**
   * `Secure` en las cookies `coin_session` y `coin_device`. Una sola condición para las dos, para
   * que nunca se separen: `NODE_ENV=production` (staging y producción, siempre con HTTPS). Sin
   * definir, `false`, como en desarrollo local por http.
   */
  secureCookies?: boolean;
  /** Límites de peticiones en login y órdenes (D-13). */
  rateLimits: TradingRateLimits;
};
