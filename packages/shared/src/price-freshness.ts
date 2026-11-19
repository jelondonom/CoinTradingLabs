import type { InstrumentSymbol } from './instrument.js';

/**
 * Umbral de precio obsoleto por símbolo (D-11). Única fuente para `api` y `market-data`.
 * Binance solo envía un mensaje cuando cambia el bid o el ask, así que un mercado tranquilo calla
 * sin estar caído: por eso el umbral es por símbolo.
 * Valores medidos por Datos de Mercado el 2026-11-16, PROVISIONALES.
 */
export const DEFAULT_STALE_AFTER_MS = 30_000;
const STALE_AFTER_MS: Partial<Record<InstrumentSymbol, number>> = {
  EURUSD: 60_000,
  NGASUSD: 60_000,
};

/** Milisegundos sin tick a partir de los cuales el precio de `symbol` está obsoleto. */
export function staleAfterMs(symbol: InstrumentSymbol): number {
  return STALE_AFTER_MS[symbol] ?? DEFAULT_STALE_AFTER_MS;
}

/** Un tick con `ts` más de 2 s en el futuro respecto al reloj del servidor es inválido (D-11). */
export const MAX_TICK_FUTURE_MS = 2_000;
