import type { CandleInterval, InstrumentSymbol } from '@coin/shared';
import { create } from 'zustand';

export type ChartType = 'candles' | 'line' | 'area';
/** Sección visible en móvil. En escritorio la terminal muestra todo a la vez. */
export type NavSection = 'terminal' | 'markets' | 'ranking' | 'account';
export type PanelTab = 'trade' | 'positions' | 'history';

type UiState = {
  symbol: InstrumentSymbol;
  interval: CandleInterval;
  chartType: ChartType;
  nav: NavSection;
  /** Pestaña bajo la gráfica en móvil. */
  mobileTab: PanelTab;
  /** Pestaña del panel inferior en escritorio. */
  panelTab: Exclude<PanelTab, 'trade'>;
  /** Elige un símbolo y vuelve a la terminal. */
  selectSymbol: (symbol: InstrumentSymbol) => void;
  setInterval: (interval: CandleInterval) => void;
  setChartType: (chartType: ChartType) => void;
  setNav: (nav: NavSection) => void;
  setTab: (tab: PanelTab) => void;
};

export const useUiStore = create<UiState>((set) => ({
  symbol: 'BTCUSD',
  interval: '1m',
  chartType: 'candles',
  nav: 'terminal',
  mobileTab: 'trade',
  panelTab: 'positions',
  selectSymbol: (symbol) => set({ symbol, nav: 'terminal' }),
  setInterval: (interval) => set({ interval }),
  setChartType: (chartType) => set({ chartType }),
  setNav: (nav) => set({ nav }),
  setTab: (tab) => set(tab === 'trade' ? { mobileTab: tab } : { mobileTab: tab, panelTab: tab }),
}));
