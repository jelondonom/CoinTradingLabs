import { INITIAL_BALANCE_USD, getInstrument } from '@coin/shared';
import { useEffect } from 'react';
import { ConnectionBanner, ConnectionPill } from './components/connection-status.js';
import { PanelTabs } from './components/panel-tabs.js';
import { PriceMove } from './components/price-move.js';
import { LoginScreen } from './features/auth/login-screen.js';
import { redirectFor } from './features/auth/session-redirect.js';
import { session } from './features/auth/session.js';
import { ChartToolbar } from './features/chart/chart-toolbar.js';
import { PriceChart } from './features/chart/price-chart.js';
import { OrderTicket } from './features/order-ticket/order-ticket.js';
import { PositionsPanel } from './features/positions/positions-panel.js';
import { SymbolList } from './features/symbols/symbol-list.js';
import { t } from './i18n/index.js';
import { cx } from './lib/cx.js';
import { dataValue } from './lib/data-value.js';
import { formatMoney, formatPrice } from './lib/format.js';
import { navigate, useRoute, type Route } from './lib/router.js';
import { DESKTOP_QUERY, useMediaQuery } from './lib/use-media-query.js';
import { startMarketFeed } from './lib/ws/market-feed.js';
import { useMarketStore } from './stores/market-store.js';
import { useSessionStore } from './stores/session-store.js';
import { useUiStore, type NavSection } from './stores/ui-store.js';

const NAV: readonly NavSection[] = ['terminal', 'markets', 'ranking', 'account'];

function TopBar() {
  const authenticated = useSessionStore((state) => state.status === 'authenticated');
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
      {authenticated && (
        <button
          type="button"
          data-testid="logout"
          onClick={() => void session.logout()}
          className="min-h-11 px-1 text-sm font-semibold underline underline-offset-4"
        >
          {t('session.logout')}
        </button>
      )}
    </header>
  );
}

/** Sin red o con el servidor caído no se sabe si hay sesión: se avisa y se reintenta solo. */
function SessionBanner() {
  const unknown = useSessionStore((state) => state.status === 'unknown');
  if (!unknown) return null;
  return (
    <p role="status" className="flex-none bg-warn-bg px-3 py-2 text-center text-sm text-warn-text">
      {t('session.unknown')}
    </p>
  );
}

/**
 * Símbolo activo y su precio. En celular, tocar el símbolo abre la lista de mercados; en escritorio
 * la lista ya está a la vista y el símbolo es solo texto. Se dibuja una sola de las dos formas.
 */
function SymbolHeader({ isDesktop }: { isDesktop: boolean }) {
  const symbol = useUiStore((state) => state.symbol);
  const setNav = useUiStore((state) => state.setNav);
  const last = useMarketStore((state) => state.ticks[symbol]?.last);
  const direction = useMarketStore((state) => state.directions[symbol] ?? 0);
  const stale = useMarketStore((state) => state.stale[symbol] === true);
  const instrument = getInstrument(symbol);

  return (
    <div className="flex min-h-12 flex-none items-center gap-2 border-b border-line px-3">
      {isDesktop ? (
        <span data-testid="header-symbol" className="text-base font-bold">
          {symbol}
        </span>
      ) : (
        <button
          type="button"
          data-testid="header-symbol"
          onClick={() => setNav('markets')}
          aria-label={`${t('symbols.change')}: ${symbol}`}
          className="flex min-h-11 items-center gap-1 text-base font-bold"
        >
          {symbol}
          <span aria-hidden="true">▾</span>
        </button>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{instrument.name}</span>
      {stale && (
        <span className="rounded-full border border-dashed border-muted px-2 py-0.5 text-xs text-muted">
          ⚠ {t('symbols.stale')}
        </span>
      )}
      <span
        data-testid="header-price"
        data-value={dataValue(last)}
        className="text-base font-bold tabular-nums"
      >
        {formatPrice(last, instrument.pricePrecision)}
      </span>
      <PriceMove direction={direction} className="text-sm" />
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
          data-testid={`nav-${section}`}
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

/**
 * La terminal, sin efectos. `isDesktop` decide las piezas que cambian de forma con el ancho, para
 * que cada una exista una sola vez en la página. Los tests la dibujan en los dos anchos.
 */
export function AppView({ isDesktop }: { isDesktop: boolean }) {
  const nav = useUiStore((state) => state.nav);
  const mobileTab = useUiStore((state) => state.mobileTab);
  const onTerminal = nav === 'terminal';
  const trading = mobileTab === 'trade';

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <TopBar />
      <ConnectionBanner />
      <SessionBanner />
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
          <SymbolHeader isDesktop={isDesktop} />
          <ChartToolbar />
          <div className="min-h-0 flex-1">
            <PriceChart />
          </div>
        </section>

        {!isDesktop && <PanelTabs isDesktop={false} visible={onTerminal} />}

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
          <PositionsPanel isDesktop={isDesktop} />
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

/** Lleva a cada quien a su pantalla según `redirectFor` (`features/auth/session-redirect.ts`). */
function useSessionRedirect(route: Route) {
  const status = useSessionStore((state) => state.status);
  const guest = useSessionStore((state) => state.guest);
  useEffect(() => {
    const target = redirectFor(status, guest, route);
    if (target) navigate(target, { replace: true });
  }, [status, guest, route]);
}

export function App() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const route = useRoute();

  useEffect(() => startMarketFeed(), []);
  useEffect(() => session.start(), []);
  useSessionRedirect(route);

  return route === 'login' ? (
    <LoginScreen isDesktop={isDesktop} />
  ) : (
    <AppView isDesktop={isDesktop} />
  );
}
