import { z } from 'zod';
import { symbolSchema } from './instrument.js';
import { priceSchema, timestampSchema } from './primitives.js';

export const CANDLE_INTERVALS = ['1m', '5m', '15m', '1h', '1d'] as const;
export const candleIntervalSchema = z.enum(CANDLE_INTERVALS);
export type CandleInterval = z.infer<typeof candleIntervalSchema>;

export const CANDLE_INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
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
