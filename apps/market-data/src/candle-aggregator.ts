import { CANDLE_INTERVAL_MS, type Candle, type CandleInterval, type Tick } from '@coin/shared';

/** Construye en memoria la vela en curso de cada símbolo e intervalo a partir de los ticks. */
export class CandleAggregator {
  private readonly current = new Map<string, Candle>();

  update(tick: Tick, interval: CandleInterval): Candle {
    const intervalMs = CANDLE_INTERVAL_MS[interval];
    const openTime = Math.floor(tick.ts / intervalMs) * intervalMs;
    const key = `${tick.symbol}|${interval}`;
    const previous = this.current.get(key);

    const candle: Candle =
      previous && previous.openTime === openTime
        ? {
            ...previous,
            high: Math.max(previous.high, tick.last),
            low: Math.min(previous.low, tick.last),
            close: tick.last,
          }
        : {
            symbol: tick.symbol,
            interval,
            openTime,
            open: tick.last,
            high: tick.last,
            low: tick.last,
            close: tick.last,
            // El simulador no tiene volumen.
            volume: 0,
          };

    this.current.set(key, candle);
    return candle;
  }
}
