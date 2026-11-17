import type { InstrumentSymbol, Tick } from '@coin/shared';
import { create } from 'zustand';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';
/** Sentido del último movimiento del precio: sube, baja o sin cambio. */
export type Direction = 1 | -1 | 0;

type MarketState = {
  connection: ConnectionStatus;
  ticks: Partial<Record<InstrumentSymbol, Tick>>;
  directions: Partial<Record<InstrumentSymbol, Direction>>;
  stale: Partial<Record<InstrumentSymbol, boolean>>;
  setConnection: (connection: ConnectionStatus) => void;
  /** Aplica un lote de ticks en una sola actualización. */
  applyTicks: (batch: readonly Tick[]) => void;
  setStale: (symbol: InstrumentSymbol, stale: boolean) => void;
};

export const useMarketStore = create<MarketState>((set) => ({
  connection: 'connecting',
  ticks: {},
  directions: {},
  stale: {},
  setConnection: (connection) => set({ connection }),
  applyTicks: (batch) =>
    set((state) => {
      if (batch.length === 0) return state;
      const ticks = { ...state.ticks };
      const directions = { ...state.directions };
      for (const tick of batch) {
        const previous = ticks[tick.symbol];
        if (previous && tick.last !== previous.last) {
          directions[tick.symbol] = tick.last > previous.last ? 1 : -1;
        }
        ticks[tick.symbol] = tick;
      }
      return { ticks, directions };
    }),
  setStale: (symbol, stale) => set((state) => ({ stale: { ...state.stale, [symbol]: stale } })),
}));
