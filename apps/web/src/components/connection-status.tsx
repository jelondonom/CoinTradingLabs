import { t } from '../i18n/index.js';
import { cx } from '../lib/cx.js';
import { useMarketStore, type ConnectionStatus } from '../stores/market-store.js';

const LABEL: Record<ConnectionStatus, string> = {
  connecting: t('connection.connecting'),
  live: t('connection.live'),
  reconnecting: t('connection.reconnecting'),
};

/** Indicador fijo de la barra superior: icono y texto, no solo color. */
export function ConnectionPill() {
  const connection = useMarketStore((state) => state.connection);
  const live = connection === 'live';
  return (
    <span
      role="status"
      data-testid="connection-status"
      data-state={connection}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap',
        live ? 'border-up text-up' : 'border-dashed border-warn-text bg-warn-bg text-warn-text',
      )}
    >
      <span aria-hidden="true">{live ? '●' : '◌'}</span>
      {LABEL[connection]}
    </span>
  );
}

/** Franja visible mientras se recupera la conexión. */
export function ConnectionBanner() {
  const reconnecting = useMarketStore((state) => state.connection === 'reconnecting');
  if (!reconnecting) return null;
  return (
    <p
      role="alert"
      data-testid="connection-banner"
      className="flex-none bg-warn-bg px-3 py-2 text-center text-sm text-warn-text"
    >
      {t('connection.banner')}
    </p>
  );
}
