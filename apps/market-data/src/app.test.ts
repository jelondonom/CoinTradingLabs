import {
  WS_MARKET_PATH,
  healthResponseSchema,
  marketServerMessageSchema,
  type MarketClientMessage,
  type MarketServerMessage,
} from '@coin/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type MarketDataApp } from './app.js';

let app: MarketDataApp | undefined;

afterEach(async () => {
  await app?.server.close();
  app = undefined;
});

/** Abre un WebSocket contra el servidor de prueba y acumula los mensajes recibidos. */
async function connect(target: MarketDataApp) {
  const address = await target.server.listen({ host: '127.0.0.1', port: 0 });
  const socket = new WebSocket(address.replace('http', 'ws') + WS_MARKET_PATH);
  const messages: MarketServerMessage[] = [];
  const waiters: Array<() => void> = [];
  socket.addEventListener('message', (event) => {
    messages.push(marketServerMessageSchema.parse(JSON.parse(String(event.data))));
    waiters.splice(0).forEach((resolve) => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error('no se pudo conectar')));
  });

  return {
    messages,
    send: (message: MarketClientMessage | Record<string, unknown>) =>
      socket.send(JSON.stringify(message)),
    async waitFor(count: number) {
      while (messages.length < count) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
    close: () => socket.close(),
  };
}

describe('market-data', () => {
  it('GET /health cumple el contrato', async () => {
    app = await buildApp();
    const response = await app.server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json()).service).toBe('market-data');
  });

  it('entrega ticks y velas solo de los símbolos suscritos', async () => {
    app = await buildApp();
    const client = await connect(app);

    client.send({ type: 'subscribe', symbols: ['BTCUSD'], candleInterval: '1m' });
    await client.waitFor(1);
    expect(client.messages[0]).toEqual({ type: 'subscribed', symbols: ['BTCUSD'] });

    app.publishTick({ symbol: 'ETHUSD', bid: 3499, ask: 3501, last: 3500, ts: 60_000 });
    app.publishTick({ symbol: 'BTCUSD', bid: 94_990, ask: 95_010, last: 95_000, ts: 60_000 });
    await client.waitFor(3);

    expect(client.messages.slice(1).map((message) => message.type)).toEqual(['tick', 'candle']);
    expect(client.messages[1]).toMatchObject({ data: { symbol: 'BTCUSD', last: 95_000 } });
    expect(client.messages[2]).toMatchObject({ data: { interval: '1m', open: 95_000 } });
    client.close();
  });

  it('responde ping y rechaza mensajes fuera de contrato', async () => {
    app = await buildApp();
    const client = await connect(app);

    client.send({ type: 'ping' });
    client.send({ type: 'subscribe', symbols: ['TSLA'] });
    await client.waitFor(2);

    expect(client.messages[0]?.type).toBe('pong');
    expect(client.messages[1]).toMatchObject({ type: 'error', code: 'invalid_message' });
    client.close();
  });
});
