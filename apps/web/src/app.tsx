import { INITIAL_BALANCE_USD, INSTRUMENTS } from '@coin/shared';
import { useApiHealth } from './use-api-health.js';
import { useMarketFeed, type FeedStatus } from './use-market-feed.js';

const FEED_LABEL: Record<FeedStatus, string> = {
  connecting: 'Conectando…',
  open: 'En vivo',
  closed: 'Sin conexión, reintentando…',
};

const usd = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD' });

function formatPrice(value: number | undefined, decimals: number): string {
  return value === undefined ? '—' : value.toFixed(decimals);
}

export function App() {
  const { status, ticks } = useMarketFeed();
  const health = useApiHealth();

  const apiLabel =
    health === null
      ? 'API sin respuesta'
      : health.status === 'ok'
        ? 'API operativa'
        : `API degradada (${Object.entries(health.checks)
            .filter(([, state]) => state === 'down')
            .map(([name]) => name)
            .join(', ')} sin conexión)`;

  return (
    <main>
      <header>
        <h1>COIN Trading Labs</h1>
        <p className="subtitle">
          Esqueleto V0 · saldo inicial {usd.format(INITIAL_BALANCE_USD)} · apalancamiento 1:1
        </p>
        <div className="badges">
          <span className={`badge ${status === 'open' ? 'ok' : 'warn'}`}>
            Mercado: {FEED_LABEL[status]}
          </span>
          <span className={`badge ${health?.status === 'ok' ? 'ok' : 'warn'}`}>{apiLabel}</span>
        </div>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Símbolo</th>
              <th className="hide-narrow">Nombre</th>
              <th className="num">Venta (bid)</th>
              <th className="num">Compra (ask)</th>
            </tr>
          </thead>
          <tbody>
            {INSTRUMENTS.map((instrument) => {
              const tick = ticks[instrument.symbol];
              return (
                <tr key={instrument.symbol}>
                  <td className="symbol">{instrument.symbol}</td>
                  <td className="hide-narrow">{instrument.name}</td>
                  <td className="num">{formatPrice(tick?.bid, instrument.pricePrecision)}</td>
                  <td className="num">{formatPrice(tick?.ask, instrument.pricePrecision)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="note">Precios simulados. Todavía no hay un proveedor de mercado conectado.</p>
    </main>
  );
}
