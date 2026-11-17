import { SYMBOLS, type InstrumentSymbol } from '@coin/shared';
import { normalizeBookTicker } from '../normalizer/binance.js';
import {
  BINANCE_MARKETS,
  bookTickerStream,
  symbolsOf,
  type BinanceMarket,
} from '../normalizer/symbol-map.js';
import type { FeedAdapter, FeedHandlers } from './feed-adapter.js';

/** Lo mínimo que el adaptador necesita de un WebSocket. Lo cumple el `WebSocket` nativo de Node. */
export type SocketLike = {
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
};

export type FeedLogger = {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
};

export type BinanceFeedOptions = {
  /** URL base del WebSocket de spot, sin ruta. */
  spotUrl: string;
  /** URL base del WebSocket de futuros, sin ruta. */
  futuresUrl: string;
  symbols?: readonly InstrumentSymbol[];
  logger?: FeedLogger;
  /** Si un mercado pasa este tiempo sin mensajes, se da por caído y se reconecta. */
  silenceTimeoutMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Inyectables para tests. */
  createSocket?: (url: string) => SocketLike;
  now?: () => number;
  random?: () => number;
};

type Connection = {
  market: BinanceMarket;
  url: string;
  socket: SocketLike | undefined;
  open: boolean;
  attempt: number;
  lastMessageAt: number;
  rejected: number;
  reconnectTimer: NodeJS.Timeout | undefined;
};

const WATCHDOG_INTERVAL_MS = 5_000;
/** Se registra el primer mensaje rechazado y luego uno de cada tantos, para no inundar el log. */
const REJECT_LOG_EVERY = 1_000;

const silentLogger: FeedLogger = { info: () => undefined, warn: () => undefined };

/**
 * Feed real: streams públicos `bookTicker` de Binance, una conexión por mercado (spot y futuros).
 * No usa llave de API. Si una conexión cae, sus símbolos dejan de emitir hasta reconectar:
 * nunca se inventan ni se repiten precios.
 */
export class BinanceFeedAdapter implements FeedAdapter {
  readonly name = 'binance';
  readonly simulated = false;

  private readonly connections: Connection[];
  private readonly logger: FeedLogger;
  private readonly createSocket: (url: string) => SocketLike;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly silenceTimeoutMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private handlers: FeedHandlers | undefined;
  private watchdog: NodeJS.Timeout | undefined;
  private connected = false;

  constructor(options: BinanceFeedOptions) {
    const symbols = options.symbols ?? SYMBOLS;
    const baseUrls: Record<BinanceMarket, string> = {
      spot: options.spotUrl,
      futures: options.futuresUrl,
    };
    this.connections = BINANCE_MARKETS.flatMap((market) => {
      const streams = symbolsOf(market, symbols).map(bookTickerStream);
      if (streams.length === 0) return [];
      const url = `${baseUrls[market].replace(/\/+$/, '')}/stream?streams=${streams.join('/')}`;
      return [
        {
          market,
          url,
          socket: undefined,
          open: false,
          attempt: 0,
          lastMessageAt: 0,
          rejected: 0,
          reconnectTimer: undefined,
        },
      ];
    });
    this.logger = options.logger ?? silentLogger;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 30_000;
    this.backoffBaseMs = options.backoffBaseMs ?? 1_000;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
  }

  start(handlers: FeedHandlers): Promise<void> {
    if (this.handlers) return Promise.reject(new Error('El feed de Binance ya está iniciado.'));
    this.handlers = handlers;
    for (const connection of this.connections) this.connect(connection);
    this.watchdog = setInterval(() => this.checkSilence(), WATCHDOG_INTERVAL_MS);
    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (!this.handlers) return Promise.resolve();
    const { onStatus } = this.handlers;
    this.handlers = undefined;
    clearInterval(this.watchdog);
    this.watchdog = undefined;
    for (const connection of this.connections) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = undefined;
      const { socket } = connection;
      connection.socket = undefined;
      connection.open = false;
      socket?.close();
    }
    if (this.connected) {
      this.connected = false;
      onStatus('disconnected');
    }
    return Promise.resolve();
  }

  private connect(connection: Connection): void {
    connection.reconnectTimer = undefined;
    const socket = this.createSocket(connection.url);
    connection.socket = socket;
    // Un socket viejo puede seguir emitiendo eventos después de ser reemplazado: se ignoran.
    const isCurrent = () => connection.socket === socket;

    socket.addEventListener('open', () => {
      if (!isCurrent()) return;
      connection.open = true;
      connection.attempt = 0;
      connection.lastMessageAt = this.now();
      this.logger.info({ market: connection.market }, 'binance: mercado conectado');
      this.updateStatus();
    });
    socket.addEventListener('message', (event) => {
      if (!isCurrent()) return;
      this.handleMessage(connection, event.data);
    });
    socket.addEventListener('close', () => this.handleDrop(connection, socket, 'conexión cerrada'));
    socket.addEventListener('error', () => this.handleDrop(connection, socket, 'error de red'));
  }

  private handleMessage(connection: Connection, data: unknown): void {
    const receivedAt = this.now();
    connection.lastMessageAt = receivedAt;
    const result =
      typeof data === 'string'
        ? normalizeBookTicker(connection.market, data, receivedAt)
        : ({ ok: false, reason: 'invalid_shape' } as const);
    if (result.ok) {
      this.handlers?.onTick(result.tick);
      return;
    }
    connection.rejected += 1;
    if (connection.rejected % REJECT_LOG_EVERY === 1) {
      this.logger.warn(
        { market: connection.market, reason: result.reason, rejected: connection.rejected },
        'binance: mensaje descartado por no cumplir el contrato',
      );
    }
  }

  private handleDrop(connection: Connection, socket: SocketLike, cause: string): void {
    if (connection.socket !== socket) return;
    connection.socket = undefined;
    connection.open = false;
    socket.close();
    this.updateStatus();
    if (!this.handlers) return;

    const ceiling = Math.min(this.backoffMaxMs, this.backoffBaseMs * 2 ** connection.attempt);
    // Espera entre el 50% y el 100% del tope, para no reconectar todo al mismo tiempo.
    const delayMs = Math.round(ceiling * (0.5 + this.random() * 0.5));
    connection.attempt += 1;
    this.logger.warn(
      { market: connection.market, cause, attempt: connection.attempt, delayMs },
      'binance: mercado caído, se reintenta',
    );
    connection.reconnectTimer = setTimeout(() => this.connect(connection), delayMs);
  }

  private checkSilence(): void {
    const now = this.now();
    for (const connection of this.connections) {
      const { socket } = connection;
      if (!socket || !connection.open) continue;
      if (now - connection.lastMessageAt > this.silenceTimeoutMs) {
        this.handleDrop(connection, socket, 'sin mensajes');
      }
    }
  }

  /** El feed está conectado solo si todos los mercados lo están. */
  private updateStatus(): void {
    const connected = this.connections.every((connection) => connection.open);
    if (connected === this.connected) return;
    this.connected = connected;
    this.handlers?.onStatus(connected ? 'connected' : 'disconnected');
  }
}
