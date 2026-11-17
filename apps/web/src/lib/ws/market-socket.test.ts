import type { MarketServerMessage } from '@coin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMarketSocket,
  retryDelay,
  type SocketLike,
  type SocketState,
} from './market-socket.js';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(data: unknown): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const states: SocketState[] = [];
  const messages: MarketServerMessage[] = [];
  const client = createMarketSocket({
    url: 'ws://test/ws/market',
    onMessage: (message) => messages.push(message),
    onState: (state) => states.push(state),
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    random: () => 1,
  });
  return { client, sockets, states, messages };
}

describe('retryDelay', () => {
  it('crece de forma exponencial hasta un tope', () => {
    expect(retryDelay(1, () => 1)).toBe(500);
    expect(retryDelay(3, () => 1)).toBe(2000);
    expect(retryDelay(20, () => 1)).toBe(8000);
  });

  it('aplica variación aleatoria entre la mitad y el total', () => {
    expect(retryDelay(3, () => 0)).toBe(1000);
  });
});

describe('createMarketSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('envía la suscripción al abrir', () => {
    const { client, sockets, states } = setup();
    client.subscribe(['BTCUSD', 'AAPL'], '5m');
    expect(sockets[0]?.sent).toEqual([]);
    sockets[0]?.open();
    expect(sockets[0]?.sent).toEqual([
      { type: 'subscribe', symbols: ['BTCUSD', 'AAPL'], candleInterval: '5m' },
    ]);
    expect(states).toEqual(['connecting', 'open']);
  });

  it('entrega solo los mensajes que cumplen el contrato', () => {
    const { sockets, messages } = setup();
    sockets[0]?.open();
    sockets[0]?.receive('no es json');
    sockets[0]?.receive({ type: 'tick', data: { symbol: 'BTCUSD' } });
    sockets[0]?.receive({
      type: 'tick',
      data: { symbol: 'BTCUSD', bid: 99, ask: 101, last: 100, ts: 1 },
    });
    expect(messages).toHaveLength(1);
  });

  it('reconecta sola y repite la suscripción', () => {
    const { client, sockets, states } = setup();
    client.subscribe(['BTCUSD'], '1m');
    sockets[0]?.open();
    sockets[0]?.close();
    expect(states.at(-1)).toBe('reconnecting');

    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(states.at(-1)).toBe('open');
    expect(sockets[1]?.sent).toEqual([
      { type: 'subscribe', symbols: ['BTCUSD'], candleInterval: '1m' },
    ]);
  });

  it('cierra la conexión si el servidor queda en silencio', () => {
    const { sockets, states } = setup();
    sockets[0]?.open();
    vi.advanceTimersByTime(60_000);
    expect(sockets[0]?.sent).toContainEqual({ type: 'ping' });
    expect(states.at(-1)).toBe('reconnecting');
  });

  it('no reconecta después de close()', () => {
    const { client, sockets, states } = setup();
    sockets[0]?.open();
    client.close();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(states).toEqual(['connecting', 'open']);
  });
});
