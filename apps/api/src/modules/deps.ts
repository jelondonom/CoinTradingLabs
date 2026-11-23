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
  /** Límites de peticiones en login y órdenes (D-13). */
  rateLimits: TradingRateLimits;
};
