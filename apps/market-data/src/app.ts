import {
  CANDLE_INTERVALS,
  WS_MARKET_PATH,
  marketClientMessageSchema,
  parseWsMessage,
  type CandleInterval,
  type HealthResponse,
  type InstrumentSymbol,
  type MarketServerMessage,
  type Tick,
} from '@coin/shared';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { CandleAggregator } from './candle-aggregator.js';

type Subscription = {
  symbols: Set<InstrumentSymbol>;
  candleInterval?: CandleInterval;
};

export type MarketDataApp = {
  server: FastifyInstance;
  /** Envía el tick, y la vela que le corresponde, a los clientes suscritos al símbolo. */
  publishTick: (tick: Tick) => void;
  clientCount: () => number;
};

export async function buildApp(options: { logLevel?: string } = {}): Promise<MarketDataApp> {
  const server = Fastify({
    logger: options.logLevel ? { level: options.logLevel } : false,
  });
  const clients = new Map<WebSocket, Subscription>();
  const candles = new CandleAggregator();
  let lastTickAt = 0;

  await server.register(websocket);

  server.get('/health', async () => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'market-data',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { feed: lastTickAt > 0 && Date.now() - lastTickAt < 10_000 ? 'up' : 'down' },
    };
    return body;
  });

  server.get(WS_MARKET_PATH, { websocket: true }, (socket) => {
    const subscription: Subscription = { symbols: new Set() };
    clients.set(socket, subscription);
    const send = (message: MarketServerMessage) => socket.send(JSON.stringify(message));

    socket.on('message', (raw) => {
      const message = parseWsMessage(marketClientMessageSchema, raw.toString());
      if (!message) {
        send({ type: 'error', code: 'invalid_message', message: 'Mensaje fuera de contrato.' });
        return;
      }
      switch (message.type) {
        case 'ping':
          send({ type: 'pong', ts: Date.now() });
          return;
        case 'subscribe':
          for (const symbol of message.symbols) subscription.symbols.add(symbol);
          if (message.candleInterval) subscription.candleInterval = message.candleInterval;
          break;
        case 'unsubscribe':
          for (const symbol of message.symbols) subscription.symbols.delete(symbol);
          break;
      }
      send({ type: 'subscribed', symbols: [...subscription.symbols] });
    });

    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });

  function publishTick(tick: Tick): void {
    lastTickAt = Date.now();
    const tickPayload = JSON.stringify({ type: 'tick', data: tick } satisfies MarketServerMessage);
    const candlePayloads = new Map<CandleInterval, string>();
    for (const interval of CANDLE_INTERVALS) {
      const candle = candles.update(tick, interval);
      candlePayloads.set(
        interval,
        JSON.stringify({ type: 'candle', data: candle } satisfies MarketServerMessage),
      );
    }

    for (const [socket, subscription] of clients) {
      if (socket.readyState !== socket.OPEN || !subscription.symbols.has(tick.symbol)) continue;
      socket.send(tickPayload);
      const candlePayload =
        subscription.candleInterval && candlePayloads.get(subscription.candleInterval);
      if (candlePayload) socket.send(candlePayload);
    }
  }

  return { server, publishTick, clientCount: () => clients.size };
}
