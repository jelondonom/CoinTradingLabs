import type { Candle } from '@coin/shared';
import type { CandlestickData, LineData, UTCTimestamp } from 'lightweight-charts';

/**
 * Lightweight Charts dibuja las horas en UTC. Para mostrar la hora local del usuario se desplaza
 * la marca de tiempo. `offsetMinutes` es el valor de `Date.prototype.getTimezoneOffset()`.
 */
export function toChartTime(openTime: number, offsetMinutes: number): UTCTimestamp {
  return Math.floor((openTime - offsetMinutes * 60_000) / 1000) as UTCTimestamp;
}

export function toBar(candle: Candle, offsetMinutes: number): CandlestickData<UTCTimestamp> {
  return {
    time: toChartTime(candle.openTime, offsetMinutes),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

export function toPoint(candle: Candle, offsetMinutes: number): LineData<UTCTimestamp> {
  return { time: toChartTime(candle.openTime, offsetMinutes), value: candle.close };
}
