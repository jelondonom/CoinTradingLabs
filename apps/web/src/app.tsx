import { INITIAL_BALANCE_USD, getInstrument } from '@coin/shared';
import { useEffect } from 'react';
import { ConnectionBanner, ConnectionPill } from './components/connection-status.js';
import { PriceMove } from './components/price-move.js';
import { ChartToolbar } from './features/chart/chart-toolbar.js';
import { PriceChart } from './features/chart/price-chart.js';
import { OrderTicket } from './features/order-ticket/order-ticket.js';
import { PositionsPanel } from './features/positions/positions-panel.js';
import { SymbolList } from './features/symbols/symbol-list.js';
import { t } from './i18n/index.js';
import { cx } from './lib/cx.js';
import { formatMoney, formatPrice } from './lib/format.js';
import { startMarketFeed } from './lib/ws/market-feed.js';
import { useMarketStore } from './stores/market-store.js';
import { useUiStore, type NavSection, type PanelTab } from './stores/ui-store.js';

const NAV: readonly NavSection[] = ['terminal', 'markets', 'ranking', 'account'];
const MOBILE_TABS: readonly PanelTab[] = ['trade', 'positions', 'history'];

function TopBar() {
  return (
    <header className="flex h-12 flex-none items-center gap-2 border-b border-line bg-surface px-3">
      <span className="font-extrabold tracking-wide lg:hidden">{t('app.shortName')}</span>
      <span className="hidden font-extrabold tracking-wide lg:inline">{t('app.name')}</span>
      <ConnectionPill />
      <span className="flex-1" />
      <span className="text-right leading-tight">
        <span className="block text-[11px] text-muted">{t('account.initialBalance')}</span>
        <span className="block text-sm font-bold tabular-nums">
          {formatMoney(INITIAL_BALANCE_USD)}
        </span>
      </span>
    </header>
  );
}

/** Símbolo activo y su precio. En móvil, tocarlo abre la lista de mercados. */
function SymbolHeader() {
  const symbol = useUiStore((state) => state.symbol);
  const setNav = useUiStore((state) => state.setNav);
  const last = useMarketStore((state) => state.ticks[symbol]?.last);
  const direction = useMarketStore((state) => state.directions[symbol] ?? 0);
  const stale = useMarketStore((state) => state.stale[symbol] === true);
  const instrument = getInstrument(symbol);

  return (
    <div className="flex min-h-12 flex-none items-center gap-2 border-b border-line px-3">
      <button
        type="button"
        onClick={() => setNav('markets')}
        aria-label={`${t('symbols.change')}: ${symbol}`}
        className="flex min-h-11 items-center gap-1 text-base font-bold lg:hidden"
      >
        {symbol}
        <span aria-hidden="true">▾</span>
      </button>
      <span className="hidden text-base font-bold lg:inline">{symbol}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{instrument.name}</span>
      {stale && (
        <span className="rounded-full border border-dashed border-muted px-2 py-0.5 text-xs text-muted">
          ⚠ {t('symbols.stale')}
        </span>
      )}
      <span className="text-base font-bold tabular-nums">
        {formatPrice(last, instrument.pricePrecision)}
      </span>
      <PriceMove direction={direction} className="text-sm" />
    </div>
  );
}

function MobileTabs({ visible }: { visible: boolean }) {
  const mobileTab = useUiStore((state) => state.mobileTab);
  const setTab = useUiStore((state) => state.setTab);
  return (
    <div
      role="group"
      aria-label={t('tabs.label')}
      className={cx(
        visible ? 'flex' : 'hidden',
        'flex-none border-b border-line bg-surface lg:hidden',
      )}
    >
      {MOBILE_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-pressed={tab === mobileTab}
          onClick={() => setTab(tab)}
          className={cx(
            'min-h-11 flex-1 text-sm',
            tab === mobileTab ? 'font-bold shadow-[inset_0_-3px_0_var(--text)]' : 'text-muted',
          )}
        >
          {t(`tabs.${tab}`)}
        </button>
      ))}
    </div>
  );
}

function BottomNav() {
  const nav = useUiStore((state) => state.nav);
  const setNav = useUiStore((state) => state.setNav);
  return (
    <nav
      aria-label={t('nav.label')}
      className="flex h-14 flex-none border-t border-line bg-surface lg:hidden"
    >
      {NAV.map((section) => (
        <button
          key={section}
          type="button"
          aria-current={section === nav ? 'page' : undefined}
          onClick={() => setNav(section)}
          className={cx(
            'flex-1 text-xs',
            section === nav ? 'font-bold shadow-[inset_0_3px_0_var(--text)]' : 'text-muted',
          )}
        >
          {t(`nav.${section}`)}
        </button>
      ))}
    </nav>
  );
}

export function App() {
  const nav = useUiStore((state) => state.nav);
  const mobileTab = useUiStore((state) => state.mobileTab);
  const onTerminal = nav === 'terminal';
  const trading = mobileTab === 'trade';

  useEffect(() => startMarketFeed(), []);

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <TopBar />
      <ConnectionBanner />
      <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[260px_minmax(0,1fr)_300px] lg:grid-rows-[minmax(0,1fr)_200px]">
        <aside
          className={cx(
            nav === 'markets' ? 'flex' : 'hidden',
            'min-h-0 flex-1 flex-col border-line lg:flex lg:border-r',
          )}
        >
          <SymbolList />
        </aside>

        <section
          className={cx(
            onTerminal ? 'flex' : 'hidden',
            trading ? 'h-[44dvh]' : 'h-[28dvh]',
            'min-h-0 flex-none flex-col bg-surface lg:flex lg:h-auto',
          )}
        >
          <SymbolHeader />
          <ChartToolbar />
          <div className="min-h-0 flex-1">
            <PriceChart />
          </div>
        </section>

        <MobileTabs visible={onTerminal} />

        <section
          className={cx(
            onTerminal && trading ? 'block' : 'hidden',
            'min-h-0 flex-1 overflow-y-auto border-line bg-surface lg:block lg:border-l',
          )}
        >
          <OrderTicket />
        </section>

        <section
          className={cx(
            onTerminal && !trading ? 'flex' : 'hidden',
            'min-h-0 flex-1 flex-col border-line lg:col-span-3 lg:flex lg:border-t',
          )}
        >
          <PositionsPanel />
        </section>

        {(nav === 'ranking' || nav === 'account') && (
          <p className="flex-1 p-6 text-center text-sm text-muted lg:hidden">
            {t('nav.comingSoon')}
          </p>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
