import { z } from 'zod';
import { candleIntervalSchema, candleSchema } from './candle.js';
import { symbolSchema } from './instrument.js';
import { tickSchema } from './tick.js';
import { wsErrorSchema, wsPingSchema, wsPongSchema } from './ws-common.js';

/** WebSocket público de mercado. Lo sirve `apps/market-data`. */
export const WS_MARKET_PATH = '/ws/market';

const symbolListSchema = z.array(symbolSchema).min(1);

export const marketClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe'),
    symbols: symbolListSchema,
    /** Si se indica, además de ticks se reciben las velas de ese intervalo. */
    candleInterval: candleIntervalSchema.optional(),
  }),
  z.object({ type: z.literal('unsubscribe'), symbols: symbolListSchema }),
  wsPingSchema,
]);
export type MarketClientMessage = z.infer<typeof marketClientMessageSchema>;

export const marketServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tick'), data: tickSchema }),
  z.object({ type: z.literal('candle'), data: candleSchema }),
  /** Confirma la lista completa de símbolos suscritos tras un subscribe o unsubscribe. */
  z.object({ type: z.literal('subscribed'), symbols: z.array(symbolSchema) }),
  wsPongSchema,
  wsErrorSchema,
]);
export type MarketServerMessage = z.infer<typeof marketServerMessageSchema>;
