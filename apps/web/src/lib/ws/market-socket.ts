import {
  marketServerMessageSchema,
  parseWsMessage,
  type CandleInterval,
  type InstrumentSymbol,
  type MarketClientMessage,
  type MarketServerMessage,
} from '@coin/shared';

export type SocketState = 'connecting' | 'open' | 'reconnecting';

/** Lo mínimo que se usa de un WebSocket; permite sustituirlo en los tests. */
export type SocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
};

export type MarketSocketOptions = {
  url: string;
  onMessage: (message: MarketServerMessage) => void;
  onState: (state: SocketState) => void;
  createSocket?: (url: string) => SocketLike;
  random?: () => number;
};

export type MarketSocket = {
  /** Fija la suscripción deseada. Se reenvía sola después de cada reconexión. */
  subscribe: (symbols: readonly InstrumentSymbol[], candleInterval: CandleInterval) => void;
  close: () => void;
};

const OPEN = 1;
const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 8000;
const PING_MS = 20_000;
/** Sin ningún mensaje en este tiempo (ni siquiera un pong) la conexión se da por caída. */
const SILENCE_MS = 45_000;

/** Espera antes del intento `attempt` (desde 1): exponencial, con tope y variación aleatoria. */
export function retryDelay(attempt: number, random: () => number): number {
  const ceiling = Math.min(BASE_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS);
  // La variación evita que cientos de clientes reconecten en el mismo instante.
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

export function createMarketSocket(options: MarketSocketOptions): MarketSocket {
  const createSocket =
    options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const random = options.random ?? Math.random;

  let socket: SocketLike | undefined;
  let subscription: MarketClientMessage | undefined;
  let attempt = 0;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let lastMessageAt = 0;

  function send(message: MarketClientMessage): void {
    if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
  }

  function stopPing(): void {
    clearInterval(pingTimer);
    pingTimer = undefined;
  }

  function connect(): void {
    const current = createSocket(options.url);
    socket = current;

    current.onopen = () => {
      attempt = 0;
      lastMessageAt = Date.now();
      options.onState('open');
      if (subscription) send(subscription);
      stopPing();
      pingTimer = setInterval(() => {
        if (Date.now() - lastMessageAt > SILENCE_MS) {
          current.close();
          return;
        }
        send({ type: 'ping' });
      }, PING_MS);
    };

    current.onmessage = (event) => {
      lastMessageAt = Date.now();
      const message = parseWsMessage(marketServerMessageSchema, String(event.data));
      if (message) options.onMessage(message);
    };

    current.onclose = () => {
      if (socket !== current) return;
      stopPing();
      if (closed) return;
      attempt += 1;
      options.onState('reconnecting');
      retryTimer = setTimeout(connect, retryDelay(attempt, random));
    };
  }

  options.onState('connecting');
  connect();

  return {
    subscribe(symbols, candleInterval) {
      subscription = { type: 'subscribe', symbols: [...symbols], candleInterval };
      send(subscription);
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      stopPing();
      socket?.close();
    },
  };
}
