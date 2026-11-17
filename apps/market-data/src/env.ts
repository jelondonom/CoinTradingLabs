import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).default('false');
const webSocketUrl = z.string().regex(/^wss?:\/\/\S+$/, 'debe empezar por ws:// o wss://');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MARKET_DATA_HOST: z.string().min(1).default('0.0.0.0'),
  MARKET_DATA_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FEED: z.enum(['mock', 'live']).default('mock'),
  ALLOW_MOCK_FEED_IN_PRODUCTION: booleanFlag,
  MOCK_FEED_SEED: z.coerce.number().int().nonnegative().optional(),
  TICK_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  BINANCE_SPOT_WS_URL: webSocketUrl.default('wss://stream.binance.com:9443'),
  BINANCE_FUTURES_WS_URL: webSocketUrl.default('wss://fstream.binance.com'),
  MAX_TICKS_PER_SECOND: z.coerce.number().int().min(1).max(20).default(4),
  REDIS_URL: z.url().optional(),
});

const DEV_REDIS_URL = 'redis://localhost:6379';

export type FeedKind = 'mock' | 'live';

export type Env = {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  host: string;
  port: number;
  /** `mock`: precios simulados. `live`: proveedor real. */
  feed: FeedKind;
  /** Semilla opcional del feed simulado, para secuencias reproducibles. */
  mockFeedSeed?: number;
  tickIntervalMs: number;
  binanceSpotWsUrl: string;
  binanceFuturesWsUrl: string;
  /** Máximo de ticks por segundo y símbolo que se envían a los clientes. */
  maxTicksPerSecond: number;
  /** Redis donde se publica el último precio para el motor de trading. */
  redisUrl: string;
};

/** Valida las variables de entorno al arrancar. Lanza un error legible si algo falta. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Variables de entorno inválidas:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (
    env.NODE_ENV === 'production' &&
    env.FEED === 'mock' &&
    env.ALLOW_MOCK_FEED_IN_PRODUCTION !== 'true'
  ) {
    throw new Error(
      'Variables de entorno inválidas:\n' +
        'FEED=mock no se permite en producción. Usa FEED=live o, con orden explícita del ' +
        'Gerente, define ALLOW_MOCK_FEED_IN_PRODUCTION=true.',
    );
  }
  if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
    throw new Error('Variables de entorno inválidas:\nEn producción REDIS_URL es obligatoria.');
  }
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    host: env.MARKET_DATA_HOST,
    port: env.MARKET_DATA_PORT,
    feed: env.FEED,
    ...(env.MOCK_FEED_SEED === undefined ? {} : { mockFeedSeed: env.MOCK_FEED_SEED }),
    tickIntervalMs: env.TICK_INTERVAL_MS,
    binanceSpotWsUrl: env.BINANCE_SPOT_WS_URL,
    binanceFuturesWsUrl: env.BINANCE_FUTURES_WS_URL,
    maxTicksPerSecond: env.MAX_TICKS_PER_SECOND,
    redisUrl: env.REDIS_URL ?? DEV_REDIS_URL,
  };
}
