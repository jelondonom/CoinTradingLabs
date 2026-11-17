import { t } from '../i18n/index.js';
import { cx } from '../lib/cx.js';
import type { Direction } from '../stores/market-store.js';

/** Sentido del último movimiento: flecha y color, nunca solo color. */
export function PriceMove({ direction, className }: { direction: Direction; className?: string }) {
  if (direction === 0) {
    return (
      <span className={cx('text-muted', className)} aria-hidden="true">
        –
      </span>
    );
  }
  const up = direction === 1;
  return (
    <span className={cx(up ? 'text-up' : 'text-down', className)}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="sr-only">{t(up ? 'symbols.up' : 'symbols.down')}</span>
    </span>
  );
}
