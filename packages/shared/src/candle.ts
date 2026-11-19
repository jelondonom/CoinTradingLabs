import { z } from 'zod';
import { symbolSchema } from './instrument.js';
import { priceSchema, timestampSchema } from './primitives.js';

export const CANDLE_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export const candleIntervalSchema = z.enum(CANDLE_INTERVALS);
export type CandleInterval = z.infer<typeof candleIntervalSchema>;

export const CANDLE_INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export const candleSchema = z
  .object({
    symbol: symbolSchema,
    interval: candleIntervalSchema,
    /** Inicio de la vela, alineado al intervalo. */
    openTime: timestampSchema,
    open: priceSchema,
    high: priceSchema,
    low: priceSchema,
    close: priceSchema,
    volume: z.number().nonnegative().finite(),
  })
  .refine((c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close), {
    message: 'high y low deben contener a open y close',
  });
export type Candle = z.infer<typeof candleSchema>;

/**
 * Historial de velas. Ruta del servidor `market-data`; el navegador la llama como
 * `/market/candles` (ADR-0004).
 */
export const CANDLES_PATH = '/candles';

export const CANDLES_DEFAULT_LIMIT = 500;
export const CANDLES_MAX_LIMIT = 1000;

/** Marca de tiempo en la query string. Un valor vacío (`from=`) cuenta como no enviado. */
const queryTimestampSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().pipe(timestampSchema).optional(),
);

/**
 * Parámetros de `GET /candles` (query string, por eso se convierten a número).
 * Devuelve las últimas `limit` velas con `openTime` entre `from` y `to`, ambos incluidos.
 * Sin `to`, hasta ahora; sin `from`, sin límite inferior.
 */
export const candlesQuerySchema = z
  .object({
    symbol: symbolSchema,
    interval: candleIntervalSchema,
    from: queryTimestampSchema,
    to: queryTimestampSchema,
    limit: z.coerce.number().int().min(1).max(CANDLES_MAX_LIMIT).default(CANDLES_DEFAULT_LIMIT),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: 'from debe ser menor o igual que to',
  });
export type CandlesQuery = z.infer<typeof candlesQuerySchema>;

/** Respuesta de `GET /candles`: velas ordenadas por `openTime` ascendente, sin repetir. */
export const candlesResponseSchema = z.object({
  symbol: symbolSchema,
  interval: candleIntervalSchema,
  candles: z.array(candleSchema),
});
export type CandlesResponse = z.infer<typeof candlesResponseSchema>;
