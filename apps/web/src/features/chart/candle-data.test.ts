import type { Candle } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { toBar, toChartTime, toPoint } from './candle-data.js';

const candle: Candle = {
  symbol: 'BTCUSD',
  interval: '1m',
  openTime: Date.UTC(2027, 0, 15, 15, 30),
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 3,
};

describe('candle-data', () => {
  it('desplaza la hora a la zona local (Colombia, UTC−5)', () => {
    const time = toChartTime(candle.openTime, 300);
    expect(new Date(time * 1000).toISOString()).toBe('2027-01-15T10:30:00.000Z');
  });

  it('convierte una vela en barra', () => {
    expect(toBar(candle, 0)).toEqual({
      time: candle.openTime / 1000,
      open: 100,
      high: 110,
      low: 95,
      close: 105,
    });
  });

  it('convierte una vela en punto con el precio de cierre', () => {
    expect(toPoint(candle, 0)).toEqual({ time: candle.openTime / 1000, value: 105 });
  });
});
