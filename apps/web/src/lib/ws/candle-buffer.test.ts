import type { Candle } from '@coin/shared';
import { describe, expect, it, vi } from 'vitest';
import { CandleBuffer } from './candle-buffer.js';

function candle(openTime: number, close: number, overrides: Partial<Candle> = {}): Candle {
  return {
    symbol: 'BTCUSD',
    interval: '1m',
    openTime,
    open: 100,
    high: 110,
    low: 90,
    close,
    volume: 0,
    ...overrides,
  };
}

describe('CandleBuffer', () => {
  it('actualiza la vela en curso y agrega la siguiente', () => {
    const buffer = new CandleBuffer('1m');
    buffer.push(candle(60_000, 101));
    buffer.push(candle(60_000, 102));
    buffer.push(candle(120_000, 103));
    expect(buffer.get('BTCUSD').map((c) => c.close)).toEqual([102, 103]);
  });

  it('ignora otras temporalidades y velas atrasadas', () => {
    const buffer = new CandleBuffer('1m');
    buffer.push(candle(120_000, 101));
    expect(buffer.push(candle(60_000, 99))).toBe(false);
    expect(buffer.push(candle(180_000, 99, { interval: '5m' }))).toBe(false);
    expect(buffer.get('BTCUSD')).toHaveLength(1);
  });

  it('separa las velas por símbolo', () => {
    const buffer = new CandleBuffer('1m');
    buffer.push(candle(60_000, 101));
    buffer.push(candle(60_000, 5, { symbol: 'AAPL' }));
    expect(buffer.get('AAPL')).toHaveLength(1);
    expect(buffer.get('ETHUSD')).toEqual([]);
  });

  it('descarta las velas al cambiar de temporalidad', () => {
    const buffer = new CandleBuffer('1m');
    buffer.push(candle(60_000, 101));
    expect(buffer.setInterval('1m')).toBe(false);
    expect(buffer.setInterval('5m')).toBe(true);
    expect(buffer.get('BTCUSD')).toEqual([]);
  });

  it('avisa a los suscriptores hasta que se dan de baja', () => {
    const buffer = new CandleBuffer('1m');
    const listener = vi.fn();
    const unsubscribe = buffer.subscribe(listener);
    buffer.push(candle(60_000, 101));
    unsubscribe();
    buffer.push(candle(120_000, 102));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
