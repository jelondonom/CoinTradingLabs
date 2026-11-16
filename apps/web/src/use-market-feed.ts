import {
  SYMBOLS,
  WS_MARKET_PATH,
  marketServerMessageSchema,
  parseWsMessage,
  type InstrumentSymbol,
  type MarketClientMessage,
  type Tick,
} from '@coin/shared';
import { useEffect, useState } from 'react';

export type FeedStatus = 'connecting' | 'open' | 'closed';
export type TickMap = Partial<Record<InstrumentSymbol, Tick>>;

const MAX_RETRY_MS = 5000;

/** Se suscribe a los ticks de todo el catálogo y reconecta sola si se cae la conexión. */
export function useMarketFeed(): { status: FeedStatus; ticks: TickMap } {
  const [status, setStatus] = useState<FeedStatus>('connecting');
  const [ticks, setTicks] = useState<TickMap>({});

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retryTimer: number | undefined;
    let attempt = 0;
    let disposed = false;

    function connect(): void {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}${WS_MARKET_PATH}`);
      setStatus('connecting');

      socket.addEventListener('open', () => {
        attempt = 0;
        setStatus('open');
        const subscribe: MarketClientMessage = { type: 'subscribe', symbols: [...SYMBOLS] };
        socket?.send(JSON.stringify(subscribe));
      });

      socket.addEventListener('message', (event) => {
        const message = parseWsMessage(marketServerMessageSchema, String(event.data));
        if (message?.type === 'tick') {
          setTicks((current) => ({ ...current, [message.data.symbol]: message.data }));
        }
      });

      socket.addEventListener('close', () => {
        if (disposed) return;
        setStatus('closed');
        attempt += 1;
        retryTimer = window.setTimeout(connect, Math.min(attempt * 1000, MAX_RETRY_MS));
      });
    }

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { status, ticks };
}
