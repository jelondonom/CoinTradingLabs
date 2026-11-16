import { Redis } from 'ioredis';
import pg from 'pg';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';

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

const app = await buildApp({
  logLevel: env.logLevel,
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
