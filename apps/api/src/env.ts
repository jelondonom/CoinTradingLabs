import { z } from 'zod';

const DEV_DATABASE_URL = 'postgresql://coin:coin@localhost:5432/coin';
const DEV_REDIS_URL = 'redis://localhost:6379';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url().optional(),
  REDIS_URL: z.url().optional(),
});

export type Env = {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
};

/** Valida las variables de entorno al arrancar. Lanza un error legible si algo falta. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Variables de entorno inválidas:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;

  // Los valores por defecto solo sirven para el Compose local.
  if (env.NODE_ENV === 'production' && (!env.DATABASE_URL || !env.REDIS_URL)) {
    throw new Error('En producción DATABASE_URL y REDIS_URL son obligatorias.');
  }

  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    host: env.API_HOST,
    port: env.API_PORT,
    databaseUrl: env.DATABASE_URL ?? DEV_DATABASE_URL,
    redisUrl: env.REDIS_URL ?? DEV_REDIS_URL,
  };
}
