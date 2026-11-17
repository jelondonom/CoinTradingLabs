import type { Tick } from '@coin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TickConflator } from './tick-conflator.js';

const tick = (symbol: Tick['symbol'], last: number): Tick => ({
  symbol,
  bid: last,
  ask: last,
  last,
  ts: 1,
});

describe('TickConflator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('publica solo el último tick de cada símbolo por intervalo', () => {
    const published: Tick[] = [];
    const conflator = new TickConflator(250, (t) => published.push(t));
    conflator.start();

    for (let i = 1; i <= 100; i += 1) conflator.push(tick('BTCUSD', i));
    conflator.push(tick('AAPL', 7));
    expect(published).toHaveLength(0);

    vi.advanceTimersByTime(250);
    expect(published).toEqual([tick('BTCUSD', 100), tick('AAPL', 7)]);
    conflator.stop();
  });

  it('no supera 4 envíos por segundo y símbolo', () => {
    const published: Tick[] = [];
    const conflator = new TickConflator(250, (t) => published.push(t));
    conflator.start();
    for (let ms = 0; ms < 1000; ms += 10) {
      conflator.push(tick('BTCUSD', ms + 1));
      vi.advanceTimersByTime(10);
    }
    expect(published).toHaveLength(4);
    conflator.stop();
  });

  it('no repite precios cuando no llegan ticks nuevos', () => {
    const published: Tick[] = [];
    const conflator = new TickConflator(250, (t) => published.push(t));
    conflator.start();
    conflator.push(tick('BTCUSD', 1));
    vi.advanceTimersByTime(2000);
    expect(published).toHaveLength(1);
    conflator.stop();
  });

  it('tras stop no publica lo pendiente', () => {
    const published: Tick[] = [];
    const conflator = new TickConflator(250, (t) => published.push(t));
    conflator.start();
    conflator.push(tick('BTCUSD', 1));
    conflator.stop();
    vi.advanceTimersByTime(1000);
    expect(published).toHaveLength(0);
  });
});
