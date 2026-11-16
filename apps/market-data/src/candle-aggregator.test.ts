import { candleSchema, type Tick } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { CandleAggregator } from './candle-aggregator.js';

const minute = 60_000;
const start = 30_000_000 * minute;

function tick(last: number, ts: number): Tick {
  return { symbol: 'BTCUSD', bid: last - 1, ask: last + 1, last, ts };
}

describe('CandleAggregator', () => {
  it('acumula open, high, low y close dentro del mismo minuto', () => {
    const aggregator = new CandleAggregator();
    aggregator.update(tick(100, start + 1_000), '1m');
    aggregator.update(tick(105, start + 2_000), '1m');
    aggregator.update(tick(98, start + 3_000), '1m');
    const candle = aggregator.update(tick(101, start + 4_000), '1m');

    expect(candle).toMatchObject({ openTime: start, open: 100, high: 105, low: 98, close: 101 });
    expect(candleSchema.safeParse(candle).success).toBe(true);
  });

  it('abre una vela nueva al cambiar de minuto', () => {
    const aggregator = new CandleAggregator();
    aggregator.update(tick(100, start + 59_000), '1m');
    const candle = aggregator.update(tick(110, start + minute), '1m');

    expect(candle).toMatchObject({ openTime: start + minute, open: 110, high: 110, low: 110 });
  });

  it('lleva cada intervalo por separado', () => {
    const aggregator = new CandleAggregator();
    aggregator.update(tick(100, start), '5m');
    aggregator.update(tick(100, start), '1m');
    const fiveMinutes = aggregator.update(tick(120, start + minute), '5m');
    const oneMinute = aggregator.update(tick(120, start + minute), '1m');

    expect(fiveMinutes).toMatchObject({ openTime: start, open: 100, close: 120 });
    expect(oneMinute).toMatchObject({ openTime: start + minute, open: 120 });
  });
});
