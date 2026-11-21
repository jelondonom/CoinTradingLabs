import { z } from 'zod';
import type { RateLimitConfig } from './modules/rate-limit/rate-limiter.js';

const DEV_DATABASE_URL = 'postgresql://coin:coin@localhost:5432/coin';
const DEV_REDIS_URL = 'redis://localhost:6379';
/** Solo para desarrollo local. En producción el secreto es obligatorio. */
const DEV_AUTH_TOKEN_SECRET = 'solo-desarrollo-local-no-usar-en-produccion';
/** Una entrada de `API_TRUST_PROXY`: la IP o la subred del proxy (Caddy). */
const trustedProxyEntry = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url().optional(),
  REDIS_URL: z.url().optional(),
  AUTH_TOKEN_SECRET: z.string().min(32).optional(),
  AUTH_TOKEN_TTL_HOURS: z.coerce
    .number()
    .positive()
    .max(24 * 31)
    .default(24 * 7),
  STALE_PRICE_AFTER_MS: z.coerce.number().int().positive().default(30_000),
  API_TRUST_PROXY: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) =>
        !value ||
        value.split(',').every((entry) => trustedProxyEntry.safeParse(entry.trim()).success),
      'API_TRUST_PROXY debe ser una lista de IP o CIDR separadas por coma.',
    ),
  RATE_LIMIT_LOGIN_FAILURES_PER_15_MIN: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_ORDERS_PER_MINUTE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_ORDERS_PER_DAY: z.coerce.number().int().positive().default(1000),
});

export type Env = {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  /** Secreto con el que se firman los tokens de sesión. */
  authTokenSecret: string;
  authTokenTtlMs: number;
  /** Antigüedad máxima de un tick para ejecutar una orden. */
  stalePriceAfterMs: number;
  /** IP o CIDR del proxy en el que se confía, o `false` si no hay proxy. */
  trustProxy: string | false;
  /** Límites de peticiones en login y órdenes (D-13). */
  rateLimits: RateLimitConfig;
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
  if (env.NODE_ENV === 'production' && !env.AUTH_TOKEN_SECRET) {
    throw new Error('En producción AUTH_TOKEN_SECRET es obligatoria.');
  }

  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    host: env.API_HOST,
    port: env.API_PORT,
    databaseUrl: env.DATABASE_URL ?? DEV_DATABASE_URL,
    redisUrl: env.REDIS_URL ?? DEV_REDIS_URL,
    authTokenSecret: env.AUTH_TOKEN_SECRET ?? DEV_AUTH_TOKEN_SECRET,
    authTokenTtlMs: env.AUTH_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    stalePriceAfterMs: env.STALE_PRICE_AFTER_MS,
    trustProxy: env.API_TRUST_PROXY
      ? env.API_TRUST_PROXY.split(',')
          .map((entry) => entry.trim())
          .join(',')
      : false,
    rateLimits: {
      loginFailuresPer15Min: env.RATE_LIMIT_LOGIN_FAILURES_PER_15_MIN,
      ordersPerMinute: env.RATE_LIMIT_ORDERS_PER_MINUTE,
      ordersPerDay: env.RATE_LIMIT_ORDERS_PER_DAY,
    },
  };
}
