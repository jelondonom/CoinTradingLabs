import { Redis } from 'ioredis';
import pg from 'pg';
import { buildApp } from './app.js';
import { createDb } from './db/prisma.js';
import { loadEnv } from './env.js';
import { AccountQueue } from './modules/orders/account-queue.js';
import { RedisTickSource } from './modules/orders/tick-source.js';
import { RedisCounterStore } from './modules/rate-limit/counter-store.js';
import { RateLimiter, TradingRateLimits } from './modules/rate-limit/rate-limiter.js';

const env = loadEnv();

const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  connectionTimeoutMillis: 2000,
});

const redis = new Redis(env.redisUrl, {
  // Sin cola: si Redis está caído, el chequeo falla de inmediato en vez de quedar esperando.
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
});

const db = createDb(env.databaseUrl);
const now = () => Date.now();

// Fail-open: sin Redis la petición pasa (ver `rate-limiter.ts`). El aviso sale como máximo cada
// 10 s para no inundar el log con una línea por petición durante un corte.
let lastRateLimitWarningAt = 0;
const rateLimiter = new RateLimiter(new RedisCounterStore(redis), now, (error) => {
  if (now() - lastRateLimitWarningAt < 10_000) return;
  lastRateLimitWarningAt = now();
  app.log.warn({ err: error }, 'límite de peticiones sin Redis: las peticiones pasan');
});

const app = await buildApp({
  logLevel: env.logLevel,
  trustProxy: env.trustProxy,
  trading: {
    db,
    ticks: new RedisTickSource(redis),
    queue: new AccountQueue(),
    now,
    tokenSecret: env.authTokenSecret,
    tokenTtlMs: env.authTokenTtlMs,
    rateLimits: new TradingRateLimits(rateLimiter, env.rateLimits),
  },
  checks: {
    postgres: async () => {
      await pool.query('SELECT 1');
      return true;
    },
    redis: async () => (await redis.ping()) === 'PONG',
  },
});

// Sin estos manejadores, un corte de conexión tumbaría el proceso.
pool.on('error', (error) => app.log.error({ err: error }, 'error en el pool de Postgres'));
redis.on('error', (error) => app.log.debug({ err: error }, 'error de conexión con Redis'));

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'cerrando api');
  await app.close();
  redis.disconnect();
  await db.$disconnect();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: env.host, port: env.port });
} catch (error) {
  app.log.fatal({ err: error }, 'la api no pudo arrancar');
  process.exit(1);
}
