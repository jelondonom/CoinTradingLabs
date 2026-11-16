import { describe, expect, it } from 'vitest';
import {
  INITIAL_BALANCE_USD,
  INSTRUMENTS,
  LEVERAGE,
  SYMBOLS,
  accountSchema,
  accountServerMessageSchema,
  candleSchema,
  getInstrument,
  instrumentSchema,
  marketClientMessageSchema,
  marketServerMessageSchema,
  orderSchema,
  parseWsMessage,
  placeOrderRequestSchema,
  positionSchema,
  tickSchema,
} from './index.js';

const id = '3f1c9a52-6f0e-4c58-9d55-0d6a1b2c3d4e';
const now = 1_800_000_000_000;

const account = {
  id,
  currency: 'USD',
  initialBalance: INITIAL_BALANCE_USD,
  balance: INITIAL_BALANCE_USD,
  equity: INITIAL_BALANCE_USD,
  leverage: LEVERAGE,
  createdAt: now,
  updatedAt: now,
};

const order = {
  id,
  accountId: id,
  clientOrderId: null,
  symbol: 'BTCUSD',
  side: 'buy',
  type: 'market',
  quantity: 0.5,
  status: 'filled',
  filledPrice: 60_000,
  rejectReason: null,
  createdAt: now,
  filledAt: now,
};

const position = {
  id,
  accountId: id,
  symbol: 'BTCUSD',
  side: 'long',
  quantity: 0.5,
  avgEntryPrice: 60_000,
  marketPrice: 61_000,
  unrealizedPnl: 500,
  realizedPnl: 0,
  openedAt: now,
  updatedAt: now,
};

describe('supuestos V0', () => {
  it('saldo inicial de 100.000 USD y apalancamiento 1:1', () => {
    expect(INITIAL_BALANCE_USD).toBe(100_000);
    expect(LEVERAGE).toBe(1);
  });

  it('catálogo de 31 símbolos sin repetir, cada uno con un instrumento válido', () => {
    expect(SYMBOLS).toHaveLength(31);
    expect(new Set(SYMBOLS).size).toBe(31);
    expect(INSTRUMENTS.map((i) => i.symbol)).toEqual([...SYMBOLS]);
    for (const instrument of INSTRUMENTS) {
      expect(instrumentSchema.safeParse(instrument).success).toBe(true);
    }
  });

  it('reparto por clase: 10 cripto, 14 acciones y ETF, 6 materias primas y 1 forex', () => {
    const count = (assetClass: string) =>
      INSTRUMENTS.filter((i) => i.assetClass === assetClass).length;
    expect(count('crypto')).toBe(10);
    expect(count('stock')).toBe(14);
    expect(count('commodity')).toBe(6);
    expect(count('forex')).toBe(1);
  });

  it('EURUSD cotiza con 4 decimales y la cantidad mínima sigue a quantityPrecision', () => {
    expect(getInstrument('EURUSD').pricePrecision).toBe(4);
    expect(getInstrument('BTCUSD').minQuantity).toBe(0.00001);
    expect(getInstrument('XRPUSD').minQuantity).toBe(1);
  });
});

describe('tick', () => {
  it('acepta un tick válido', () => {
    const tick = { symbol: 'EURUSD', bid: 1.085, ask: 1.0851, last: 1.08505, ts: now };
    expect(tickSchema.parse(tick)).toEqual(tick);
  });

  it('rechaza ask menor que bid y símbolos fuera del catálogo', () => {
    expect(
      tickSchema.safeParse({ symbol: 'EURUSD', bid: 1.2, ask: 1.1, last: 1.15, ts: now }).success,
    ).toBe(false);
    expect(tickSchema.safeParse({ symbol: 'JPM', bid: 1, ask: 1, last: 1, ts: now }).success).toBe(
      false,
    );
  });
});

describe('candle', () => {
  const candle = {
    symbol: 'AAPL',
    interval: '1m',
    openTime: now,
    open: 200,
    high: 201,
    low: 199,
    close: 200.5,
    volume: 0,
  };

  it('acepta una vela coherente', () => {
    expect(candleSchema.safeParse(candle).success).toBe(true);
  });

  it('rechaza high por debajo del cierre', () => {
    expect(candleSchema.safeParse({ ...candle, high: 200.2 }).success).toBe(false);
  });
});

describe('account, order y position', () => {
  it('aceptan los ejemplos de referencia', () => {
    expect(accountSchema.safeParse(account).success).toBe(true);
    expect(orderSchema.safeParse(order).success).toBe(true);
    expect(positionSchema.safeParse(position).success).toBe(true);
  });

  it('la cuenta solo admite apalancamiento 1:1', () => {
    expect(accountSchema.safeParse({ ...account, leverage: 10 }).success).toBe(false);
  });

  it('solo se pueden crear órdenes market con cantidad positiva', () => {
    const request = { symbol: 'NVDA', side: 'sell', type: 'market', quantity: 3 };
    expect(placeOrderRequestSchema.safeParse(request).success).toBe(true);
    expect(placeOrderRequestSchema.safeParse({ ...request, type: 'limit' }).success).toBe(false);
    expect(placeOrderRequestSchema.safeParse({ ...request, quantity: 0 }).success).toBe(false);
    expect(placeOrderRequestSchema.safeParse({ ...request, side: 'hold' }).success).toBe(false);
  });
});

describe('mensajes WebSocket', () => {
  it('mercado: subscribe exige al menos un símbolo', () => {
    expect(
      marketClientMessageSchema.safeParse({ type: 'subscribe', symbols: ['BTCUSD'] }).success,
    ).toBe(true);
    expect(marketClientMessageSchema.safeParse({ type: 'subscribe', symbols: [] }).success).toBe(
      false,
    );
  });

  it('mercado: discrimina por type', () => {
    const tick = { symbol: 'XAUUSD', bid: 2400, ask: 2400.5, last: 2400.25, ts: now };
    const parsed = marketServerMessageSchema.parse({ type: 'tick', data: tick });
    expect(parsed.type).toBe('tick');
    expect(marketServerMessageSchema.safeParse({ type: 'trade', data: tick }).success).toBe(false);
  });

  it('mercado: status avisa si el precio de un símbolo está desactualizado', () => {
    const status = { type: 'status', data: { symbol: 'NGASUSD', stale: true, ts: now } };
    expect(marketServerMessageSchema.parse(status)).toEqual(status);
    expect(
      marketServerMessageSchema.safeParse({ type: 'status', data: { symbol: 'NGASUSD', ts: now } })
        .success,
    ).toBe(false);
  });

  it('cuenta: snapshot con cuenta, posiciones y órdenes', () => {
    const snapshot = {
      type: 'account.snapshot',
      account,
      positions: [position],
      orders: [order],
    };
    expect(accountServerMessageSchema.safeParse(snapshot).success).toBe(true);
  });

  it('parseWsMessage devuelve null con JSON inválido o fuera de contrato', () => {
    expect(parseWsMessage(marketClientMessageSchema, 'no es json')).toBeNull();
    expect(parseWsMessage(marketClientMessageSchema, '{"type":"otro"}')).toBeNull();
    expect(parseWsMessage(marketClientMessageSchema, '{"type":"ping"}')).toEqual({ type: 'ping' });
  });
});
