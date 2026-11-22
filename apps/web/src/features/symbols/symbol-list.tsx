import { INSTRUMENTS, type AssetClass, type Instrument } from '@coin/shared';
import { memo, useMemo, useState } from 'react';
import { PriceMove } from '../../components/price-move.js';
import { t } from '../../i18n/index.js';
import { cx } from '../../lib/cx.js';
import { dataValue } from '../../lib/data-value.js';
import { formatPrice } from '../../lib/format.js';
import { useMarketStore } from '../../stores/market-store.js';
import { useUiStore } from '../../stores/ui-store.js';
import { filterInstruments, type AssetFilter } from './filter-instruments.js';
import { symbolState } from './symbol-state.js';

const FILTERS: readonly AssetFilter[] = ['all', 'crypto', 'stock', 'commodity', 'forex'];

const FILTER_LABEL: Record<AssetFilter, string> = {
  all: t('symbols.all'),
  crypto: t('symbols.crypto'),
  stock: t('symbols.stock'),
  commodity: t('symbols.commodity'),
  forex: t('symbols.forex'),
} satisfies Record<AssetClass | 'all', string>;

const SymbolRow = memo(function SymbolRow({ instrument }: { instrument: Instrument }) {
  const { symbol } = instrument;
  const last = useMarketStore((state) => state.ticks[symbol]?.last);
  const direction = useMarketStore((state) => state.directions[symbol] ?? 0);
  const stale = useMarketStore((state) => state.stale[symbol] === true);
  const active = useUiStore((state) => state.symbol === symbol);
  const selectSymbol = useUiStore((state) => state.selectSymbol);
  const state = symbolState({ hasTick: last !== undefined, stale });

  return (
    <li>
      <button
        type="button"
        data-testid={`symbol-row-${symbol}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => selectSymbol(symbol)}
        className={cx(
          'flex min-h-13 w-full items-center gap-2 border-b border-line px-3 py-1.5 text-left',
          active && 'bg-raised',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{symbol}</span>
          <span className="block truncate text-xs text-muted">{instrument.name}</span>
        </span>
        {/* Siempre existe para llevar `data-state`; sin aviso queda oculto y no ocupa espacio. */}
        <span
          data-testid={`symbol-status-${symbol}`}
          data-state={state}
          className={
            stale
              ? 'rounded-full border border-dashed border-muted px-2 py-0.5 text-xs text-muted'
              : 'hidden'
          }
        >
          {stale && `⚠ ${t('symbols.stale')}`}
        </span>
        <span className={cx('text-right tabular-nums', stale && 'text-muted')}>
          <span
            data-testid={`symbol-price-${symbol}`}
            data-value={dataValue(last)}
            className="block font-semibold"
          >
            {formatPrice(last, instrument.pricePrecision)}
          </span>
          <PriceMove direction={direction} className="block text-xs" />
        </span>
      </button>
    </li>
  );
});

export function SymbolList() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AssetFilter>('all');
  const visible = useMemo(() => filterInstruments(INSTRUMENTS, query, filter), [query, filter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex-none p-3 pb-2">
        <label className="block">
          <span className="sr-only">{t('symbols.search')}</span>
          <input
            type="search"
            data-testid="symbols-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('symbols.search')}
            className="min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-base lg:min-h-9 lg:text-sm"
          />
        </label>
        <div
          role="group"
          aria-label={t('symbols.filters')}
          className="mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-wrap"
        >
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === filter}
              onClick={() => setFilter(option)}
              className={cx(
                'min-h-11 flex-none rounded-md border px-2.5 text-sm lg:min-h-8 lg:px-2 lg:text-xs',
                option === filter
                  ? 'border-text bg-text font-semibold text-surface'
                  : 'border-line text-muted',
              )}
            >
              {FILTER_LABEL[option]}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="p-4 text-sm text-muted">{t('symbols.empty')}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((instrument) => (
            <SymbolRow key={instrument.symbol} instrument={instrument} />
          ))}
        </ul>
      )}
    </div>
  );
}
