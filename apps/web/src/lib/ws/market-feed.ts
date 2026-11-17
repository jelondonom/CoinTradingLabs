import {
  SYMBOLS,
  WS_MARKET_PATH,
  type CandleInterval,
  type MarketServerMessage,
  type Tick,
} from '@coin/shared';
import { useMarketStore } from '../../stores/market-store.js';
import { CandleBuffer } from './candle-buffer.js';
import { createMarketSocket, type MarketSocket } from './market-socket.js';

/** Los ticks se agrupan y llegan a React como mucho cuatro veces por segundo. */
const TICK_FLUSH_MS = 250;

/** Velas en vivo de la temporalidad activa. La gráfica las lee sin pasar por React. */
export const candleBuffer = new CandleBuffer('1m');

let socket: MarketSocket | undefined;

function handleMessage(message: MarketServerMessage, pending: Map<Tick['symbol'], Tick>): void {
  switch (message.type) {
    case 'tick':
      pending.set(message.data.symbol, message.data);
      return;
    case 'candle':
      candleBuffer.push(message.data);
      return;
    case 'status':
      useMarketStore.getState().setStale(message.data.symbol, message.data.stale);
      return;
    default:
      return;
  }
}

/** Abre la conexión de mercado y la mantiene. Devuelve la función que la cierra. */
export function startMarketFeed(): () => void {
  const pending = new Map<Tick['symbol'], Tick>();
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  const current = createMarketSocket({
    url: `${protocol}://${window.location.host}${WS_MARKET_PATH}`,
    onMessage: (message) => handleMessage(message, pending),
    onState: (state) => useMarketStore.getState().setConnection(state === 'open' ? 'live' : state),
  });
  socket = current;
  current.subscribe(SYMBOLS, candleBuffer.getInterval());

  const flushTimer = window.setInterval(() => {
    if (pending.size === 0) return;
    useMarketStore.getState().applyTicks([...pending.values()]);
    pending.clear();
  }, TICK_FLUSH_MS);

  return () => {
    window.clearInterval(flushTimer);
    current.close();
    if (socket === current) socket = undefined;
  };
}

/** Cambia la temporalidad de las velas que envía el servidor. */
export function setCandleInterval(interval: CandleInterval): void {
  if (candleBuffer.setInterval(interval)) socket?.subscribe(SYMBOLS, interval);
}
