import { getInstrument } from '@coin/shared';
import { useId, useState } from 'react';
import { t } from '../../i18n/index.js';
import { cx } from '../../lib/cx.js';
import { dataValue } from '../../lib/data-value.js';
import { formatMoney, formatPrice, formatQuantity } from '../../lib/format.js';
import { LOGIN_ROUTE, navigate } from '../../lib/router.js';
import { useMarketStore } from '../../stores/market-store.js';
import { useSessionStore } from '../../stores/session-store.js';
import { useUiStore } from '../../stores/ui-store.js';
import { estimateQuantity } from './estimate-quantity.js';
import { TICKET_STATUS_MESSAGE, ticketStatus } from './ticket-status.js';

const QUICK_AMOUNTS = [100, 1000, 5000] as const;

/**
 * Ticket simple: el usuario escribe un monto en dólares. Todavía no envía órdenes: el motor de
 * trading no expone el endpoint, así que los botones quedan desactivados con el motivo a la vista.
 */
export function OrderTicket() {
  const symbol = useUiStore((state) => state.symbol);
  const tick = useMarketStore((state) => state.ticks[symbol]);
  const stale = useMarketStore((state) => state.stale[symbol] === true);
  const live = useMarketStore((state) => state.connection === 'live');
  const session = useSessionStore((state) => state.status);
  const [amount, setAmount] = useState('1000');
  const inputId = useId();
  const reasonId = useId();

  const instrument = getInstrument(symbol);
  const quantity = estimateQuantity(Number(amount), tick?.ask, instrument.quantityPrecision);
  const status = ticketStatus({ live, stale, session });

  return (
    <div className="flex flex-col gap-3 bg-surface p-3">
      <div>
        <label htmlFor={inputId} className="mb-1 block text-sm text-muted">
          {t('ticket.amountLabel')}
        </label>
        <div className="flex min-h-12 items-center gap-2 rounded-lg border border-text px-3">
          <span className="text-sm text-muted">{t('ticket.currency')}</span>
          <input
            id={inputId}
            data-testid="ticket-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
            className="min-w-0 flex-1 bg-transparent py-2 text-lg font-bold tabular-nums outline-none"
          />
        </div>
        <p
          data-testid="ticket-estimate"
          data-value={dataValue(quantity)}
          className="mt-1 text-xs text-muted"
        >
          {quantity === null
            ? t('ticket.noEstimate')
            : t('ticket.estimate', {
                quantity: formatQuantity(quantity, instrument.quantityPrecision),
                symbol,
              })}
        </p>
      </div>

      <div role="group" aria-label={t('ticket.quickAmounts')} className="flex gap-1.5">
        {QUICK_AMOUNTS.map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`ticket-quick-${option}`}
            aria-pressed={Number(amount) === option}
            onClick={() => setAmount(String(option))}
            className={cx(
              'min-h-11 flex-1 rounded-md border text-sm tabular-nums lg:min-h-9',
              Number(amount) === option
                ? 'border-text bg-text font-semibold text-surface'
                : 'border-line text-muted',
            )}
          >
            {formatMoney(option, 0)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          data-testid="ticket-sell"
          disabled
          aria-describedby={reasonId}
          className="flex min-h-14 flex-col items-center justify-center rounded-xl border-2 border-down font-bold text-down disabled:opacity-60"
        >
          <span>
            <span aria-hidden="true">▼ </span>
            {t('ticket.sell')}
          </span>
          <span className="text-xs font-normal tabular-nums">
            {formatPrice(tick?.bid, instrument.pricePrecision)}
          </span>
        </button>
        <button
          type="button"
          data-testid="ticket-buy"
          disabled
          aria-describedby={reasonId}
          className="flex min-h-14 flex-col items-center justify-center rounded-xl border-2 border-up bg-up font-bold text-surface disabled:opacity-60"
        >
          <span>
            <span aria-hidden="true">▲ </span>
            {t('ticket.buy')}
          </span>
          <span className="text-xs font-normal tabular-nums">
            {formatPrice(tick?.ask, instrument.pricePrecision)}
          </span>
        </button>
      </div>

      <p
        id={reasonId}
        data-testid="ticket-status"
        data-state={status}
        className="rounded-md bg-raised px-2.5 py-2 text-xs"
      >
        <span aria-hidden="true">ⓘ </span>
        {t(TICKET_STATUS_MESSAGE[status], { symbol })}
        {status === 'no-session' && (
          <>
            {' '}
            <button
              type="button"
              data-testid="ticket-login"
              onClick={() => navigate(LOGIN_ROUTE)}
              className="font-semibold underline underline-offset-2"
            >
              {t('ticket.login')}
            </button>
          </>
        )}
      </p>
      <p className="text-xs text-muted">{t('ticket.simulated')}</p>
    </div>
  );
}
