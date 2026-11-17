import { getInstrument, type Tick } from '@coin/shared';
import { z } from 'zod';
import { toInternalSymbol, type BinanceMarket } from './symbol-map.js';

const decimalString = z.string().regex(/^\d+(\.\d+)?$/);

/** Mensaje `bookTicker` dentro de un stream combinado. Futuros trae además la hora del evento `E`. */
const bookTickerMessageSchema = z.object({
  stream: z.string(),
  data: z.object({
    s: z.string().min(1),
    b: decimalString,
    a: decimalString,
    E: z.number().int().positive().optional(),
  }),
});

export type RejectReason = 'invalid_json' | 'invalid_shape' | 'unknown_symbol' | 'invalid_price';

export type NormalizeResult = { ok: true; tick: Tick } | { ok: false; reason: RejectReason };

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Convierte un mensaje crudo de Binance al tick común. Nunca lanza: lo que no cumple se rechaza.
 * `last` es el punto medio entre bid y ask. `ts` es la hora del evento si Binance la envía
 * (futuros) o la hora de recepción (spot no la trae).
 */
export function normalizeBookTicker(
  market: BinanceMarket,
  raw: string,
  receivedAt: number,
): NormalizeResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  const parsed = bookTickerMessageSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'invalid_shape' };

  const { s, b, a, E } = parsed.data.data;
  const symbol = toInternalSymbol(market, s);
  if (!symbol) return { ok: false, reason: 'unknown_symbol' };

  const { pricePrecision } = getInstrument(symbol);
  const bid = roundTo(Number(b), pricePrecision);
  const ask = roundTo(Number(a), pricePrecision);
  if (!(bid > 0) || !(ask >= bid) || !Number.isFinite(ask)) {
    return { ok: false, reason: 'invalid_price' };
  }
  const last = Math.min(Math.max(roundTo((bid + ask) / 2, pricePrecision), bid), ask);

  return { ok: true, tick: { symbol, bid, ask, last, ts: E ?? receivedAt } };
}
