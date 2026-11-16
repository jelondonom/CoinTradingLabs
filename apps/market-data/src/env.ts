import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MARKET_DATA_HOST: z.string().min(1).default('0.0.0.0'),
  MARKET_DATA_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  TICK_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
});

export type Env = {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  host: string;
  port: number;
  tickIntervalMs: number;
};

/** Valida las variables de entorno al arrancar. Lanza un error legible si algo falta. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Variables de entorno inválidas:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    host: env.MARKET_DATA_HOST,
    port: env.MARKET_DATA_PORT,
    tickIntervalMs: env.TICK_INTERVAL_MS,
  };
}
