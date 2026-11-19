import {
  SYMBOLS,
  staleAfterMs,
  symbolStatusSchema,
  type InstrumentSymbol,
  type SymbolStatus,
} from '@coin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaleTracker, symbolStatus } from './stale-tracker.js';

const T0 = 1_800_000_000_000;

function setup() {
  const changes: SymbolStatus[] = [];
  const tracker = new StaleTracker({ onChange: (status) => changes.push(status) });
  tracker.start();
  return { tracker, changes };
}

describe('StaleTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('todo símbolo nace desactualizado porque aún no hay precio', () => {
    const { tracker, changes } = setup();
    for (const symbol of SYMBOLS) {
      const status = tracker.status(symbol);
      expect(symbolStatusSchema.safeParse(status).success).toBe(true);
      expect(status).toEqual({ symbol, stale: true, marketOpen: false, ts: T0 });
    }
    expect(changes).toEqual([]);
    tracker.stop();
  });

  it('pasa a vigente con el primer tick y avisa una sola vez', () => {
    const { tracker, changes } = setup();
    vi.advanceTimersByTime(500);
    tracker.recordTick('BTCUSD');
    tracker.recordTick('BTCUSD');
    expect(changes).toEqual([{ symbol: 'BTCUSD', stale: false, marketOpen: true, ts: T0 + 500 }]);
    expect(tracker.status('BTCUSD')).toEqual({
      symbol: 'BTCUSD',
      stale: false,
      marketOpen: true,
      ts: T0 + 500,
    });
    tracker.stop();
  });

  it('marca desactualizado al superar el umbral y vuelve a vigente con un tick nuevo', () => {
    const { tracker, changes } = setup();
    tracker.recordTick('BTCUSD');
    vi.advanceTimersByTime(30_000);
    expect(tracker.status('BTCUSD').stale).toBe(false);

    vi.advanceTimersByTime(1_000);
    expect(changes.at(-1)).toEqual({
      symbol: 'BTCUSD',
      stale: true,
      marketOpen: false,
      ts: T0 + 31_000,
    });

    vi.advanceTimersByTime(60_000);
    expect(changes).toHaveLength(2);

    tracker.recordTick('BTCUSD');
    expect(changes.at(-1)).toEqual({
      symbol: 'BTCUSD',
      stale: false,
      marketOpen: true,
      ts: T0 + 91_000,
    });
    tracker.stop();
  });

  it('mientras lleguen ticks dentro del umbral no cambia de estado', () => {
    const { tracker, changes } = setup();
    for (let i = 0; i < 20; i += 1) {
      tracker.recordTick('BTCUSD');
      vi.advanceTimersByTime(25_000);
    }
    expect(changes).toHaveLength(1);
    tracker.stop();
  });

  it('usa el umbral por símbolo de @coin/shared (D-11)', () => {
    // Si shared cambia los valores, este test sigue a shared; solo exige que el umbral lento sea mayor.
    const fast: InstrumentSymbol = 'BTCUSD';
    const slow: InstrumentSymbol = 'EURUSD';
    // Margen de 2 s para revisar justo antes y justo después del umbral lento.
    expect(staleAfterMs(slow) - staleAfterMs(fast)).toBeGreaterThan(2_000);

    const { tracker } = setup();
    tracker.recordTick(fast);
    tracker.recordTick(slow);
    // El tracker revisa cada segundo, así que basta 1 s más que el umbral para que cambie.
    vi.advanceTimersByTime(staleAfterMs(fast) + 1_000);
    expect(tracker.status(fast).stale).toBe(true);
    expect(tracker.status(slow).stale).toBe(false);
    vi.advanceTimersByTime(staleAfterMs(slow) - staleAfterMs(fast) - 2_000);
    expect(tracker.status(slow).stale).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(tracker.status(slow)).toMatchObject({ stale: true, marketOpen: false });
    tracker.stop();
  });

  it('tras stop deja de revisar', () => {
    const { tracker, changes } = setup();
    tracker.recordTick('BTCUSD');
    tracker.stop();
    vi.advanceTimersByTime(120_000);
    expect(changes).toHaveLength(1);
  });
});

describe('symbolStatus (D-05)', () => {
  it('abierto si el precio está vigente y cerrado si está obsoleto', () => {
    expect(symbolStatus('AAPL', false, 5)).toEqual({
      symbol: 'AAPL',
      stale: false,
      marketOpen: true,
      ts: 5,
    });
    expect(symbolStatus('AAPL', true, 6)).toEqual({
      symbol: 'AAPL',
      stale: true,
      marketOpen: false,
      ts: 6,
    });
  });
});
