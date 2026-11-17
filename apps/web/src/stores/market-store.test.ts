import type { Tick } from '@coin/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMarketStore } from './market-store.js';

function tick(last: number, symbol: Tick['symbol'] = 'BTCUSD'): Tick {
  return { symbol, bid: last - 1, ask: last + 1, last, ts: 1 };
}

describe('market-store', () => {
  beforeEach(() => {
    useMarketStore.setState({ ticks: {}, directions: {}, stale: {}, connection: 'connecting' });
  });

  it('guarda el último tick de cada símbolo', () => {
    useMarketStore.getState().applyTicks([tick(100), tick(50, 'AAPL'), tick(101)]);
    const { ticks } = useMarketStore.getState();
    expect(ticks.BTCUSD?.last).toBe(101);
    expect(ticks.AAPL?.last).toBe(50);
  });

  it('registra el sentido del último movimiento', () => {
    const { applyTicks } = useMarketStore.getState();
    applyTicks([tick(100)]);
    expect(useMarketStore.getState().directions.BTCUSD).toBeUndefined();
    applyTicks([tick(99)]);
    expect(useMarketStore.getState().directions.BTCUSD).toBe(-1);
    applyTicks([tick(99)]);
    expect(useMarketStore.getState().directions.BTCUSD).toBe(-1);
    applyTicks([tick(105)]);
    expect(useMarketStore.getState().directions.BTCUSD).toBe(1);
  });

  it('marca y desmarca un símbolo sin datos recientes', () => {
    const { setStale } = useMarketStore.getState();
    setStale('NVDA', true);
    expect(useMarketStore.getState().stale.NVDA).toBe(true);
    setStale('NVDA', false);
    expect(useMarketStore.getState().stale.NVDA).toBe(false);
  });
});
