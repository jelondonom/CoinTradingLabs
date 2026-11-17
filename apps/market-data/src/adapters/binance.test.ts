import { SYMBOLS, type Tick } from '@coin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FUTURES_MESSAGES, SPOT_MESSAGES } from '../normalizer/binance.fixtures.js';
import { BinanceFeedAdapter, type SocketLike } from './binance.js';
import type { FeedStatus } from './feed-adapter.js';

class FakeSocket implements SocketLike {
  closed = false;
  private readonly listeners = new Map<string, Array<(event: { data: unknown }) => void>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: 'open' | 'close' | 'error' | 'message', data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function setup(overrides: { symbols?: readonly Tick['symbol'][] } = {}) {
  const sockets: FakeSocket[] = [];
  const ticks: Tick[] = [];
  const statuses: FeedStatus[] = [];
  const warnings: Array<{ details: object; message: string }> = [];
  const feed = new BinanceFeedAdapter({
    spotUrl: 'wss://spot.test/',
    futuresUrl: 'wss://futures.test',
    random: () => 1,
    logger: {
      info: () => undefined,
      warn: (details, message) => warnings.push({ details, message }),
    },
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    ...overrides,
  });
  const handlers = {
    onTick: (tick: Tick) => ticks.push(tick),
    onStatus: (status: FeedStatus) => statuses.push(status),
  };
  const socketAt = (index: number): FakeSocket => {
    const socket = sockets[index];
    if (!socket) throw new Error(`no existe el socket ${index}`);
    return socket;
  };
  return { feed, handlers, sockets, socketAt, ticks, statuses, warnings };
}

describe('BinanceFeedAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_794_847_990_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('se declara real', () => {
    const { feed } = setup();
    expect(feed.name).toBe('binance');
    expect(feed.simulated).toBe(false);
  });

  it('abre una sola conexión por mercado con los streams pedidos', async () => {
    const { feed, handlers, sockets } = setup({
      symbols: ['BTCUSD', 'ETHUSD', 'EURUSD', 'AAPL', 'NVDA', 'XAUUSD'],
    });
    await feed.start(handlers);
    expect(sockets.map((socket) => socket.url)).toEqual([
      'wss://spot.test/stream?streams=btcusdt@bookTicker/ethusdt@bookTicker/eurusdt@bookTicker',
      'wss://futures.test/stream?streams=aaplusdt@bookTicker/nvdausdt@bookTicker/xauusdt@bookTicker',
    ]);
    await feed.stop();
  });

  it('con el catálogo completo usa dos conexiones y un stream por símbolo', async () => {
    const { feed, handlers, sockets } = setup();
    await feed.start(handlers);
    expect(sockets).toHaveLength(2);
    const streams = sockets.flatMap((socket) => socket.url.split('streams=')[1]?.split('/') ?? []);
    expect(streams).toHaveLength(SYMBOLS.length);
    expect(new Set(streams).size).toBe(SYMBOLS.length);
    await feed.stop();
  });

  it('no abre conexión a un mercado sin símbolos', async () => {
    const { feed, handlers, sockets } = setup({ symbols: ['BTCUSD'] });
    await feed.start(handlers);
    expect(sockets.map((socket) => socket.url)).toEqual([
      'wss://spot.test/stream?streams=btcusdt@bookTicker',
    ]);
    await feed.stop();
  });

  it('avisa conectado solo cuando todos los mercados están arriba', async () => {
    const { feed, handlers, socketAt, statuses } = setup();
    await feed.start(handlers);
    socketAt(0).emit('open');
    expect(statuses).toEqual([]);
    socketAt(1).emit('open');
    expect(statuses).toEqual(['connected']);
    await feed.stop();
    expect(statuses).toEqual(['connected', 'disconnected']);
  });

  it('entrega ticks normalizados de los mensajes reales grabados', async () => {
    const { feed, handlers, socketAt, ticks } = setup();
    await feed.start(handlers);
    socketAt(0).emit('open');
    socketAt(1).emit('open');
    for (const raw of SPOT_MESSAGES) socketAt(0).emit('message', raw);
    for (const raw of FUTURES_MESSAGES) socketAt(1).emit('message', raw);

    expect(ticks.map((tick) => tick.symbol)).toEqual([
      'BTCUSD',
      'ETHUSD',
      'EURUSD',
      'XAUUSD',
      'NVDA',
      'AAPL',
    ]);
    expect(ticks[0]).toMatchObject({ bid: 64651.84, ask: 64651.85, ts: 1_794_847_990_000 });
    expect(ticks[3]).toMatchObject({ bid: 3863.01, ask: 3863.02, ts: 1_794_847_990_000 });
    await feed.stop();
  });

  it('descarta y registra los mensajes que no cumplen el contrato', async () => {
    const { feed, handlers, socketAt, ticks, warnings } = setup();
    await feed.start(handlers);
    socketAt(0).emit('open');
    socketAt(0).emit('message', 'basura');
    socketAt(0).emit('message', new ArrayBuffer(4));
    socketAt(0).emit('message', FUTURES_MESSAGES[0]);

    expect(ticks).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.details).toMatchObject({ market: 'spot', reason: 'invalid_json' });
    await feed.stop();
  });

  it('reconecta con espera creciente y vuelve a 1 s tras conectar', async () => {
    const { feed, handlers, sockets, socketAt, statuses } = setup();
    await feed.start(handlers);
    socketAt(0).emit('open');
    socketAt(1).emit('open');

    socketAt(0).emit('close');
    expect(statuses).toEqual(['connected', 'disconnected']);
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    socketAt(2).emit('error');
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(4);

    socketAt(3).emit('open');
    expect(statuses).toEqual(['connected', 'disconnected', 'connected']);
    socketAt(3).emit('close');
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(5);
    await feed.stop();
  });

  it('la espera de reconexión no pasa de 30 s', async () => {
    const { feed, handlers, sockets, socketAt } = setup({ symbols: ['BTCUSD'] });
    await feed.start(handlers);
    for (let i = 0; i < 10; i += 1) {
      socketAt(i).emit('close');
      vi.advanceTimersByTime(30_000);
      expect(sockets).toHaveLength(i + 2);
    }
    await feed.stop();
  });

  it('reconecta un mercado que se queda en silencio', async () => {
    const { feed, handlers, sockets, socketAt, statuses, warnings } = setup({
      symbols: ['BTCUSD'],
    });
    await feed.start(handlers);
    socketAt(0).emit('open');
    socketAt(0).emit('message', SPOT_MESSAGES[0]);

    vi.advanceTimersByTime(36_000);
    expect(socketAt(0).closed).toBe(true);
    expect(statuses).toEqual(['connected', 'disconnected']);
    expect(warnings.at(-1)?.details).toMatchObject({ cause: 'sin mensajes' });
    expect(sockets).toHaveLength(2);
    await feed.stop();
  });

  it('ignora eventos de un socket ya reemplazado', async () => {
    const { feed, handlers, sockets, socketAt, ticks } = setup({ symbols: ['BTCUSD'] });
    await feed.start(handlers);
    socketAt(0).emit('open');
    socketAt(0).emit('close');
    vi.advanceTimersByTime(1000);
    socketAt(1).emit('open');

    socketAt(0).emit('message', SPOT_MESSAGES[0]);
    socketAt(0).emit('close');
    // Menos que el tiempo de silencio, para aislar el efecto del socket viejo.
    vi.advanceTimersByTime(20_000);
    expect(ticks).toHaveLength(0);
    expect(sockets).toHaveLength(2);
    await feed.stop();
  });

  it('tras stop cierra los sockets y no reconecta', async () => {
    const { feed, handlers, sockets, socketAt } = setup();
    await feed.start(handlers);
    socketAt(0).emit('open');
    socketAt(1).emit('close');
    await feed.stop();

    expect(socketAt(0).closed).toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(2);
  });

  it('rechaza un segundo start sin stop', async () => {
    const { feed, handlers } = setup();
    await feed.start(handlers);
    await expect(feed.start(handlers)).rejects.toThrow('ya está iniciado');
    await feed.stop();
  });
});
