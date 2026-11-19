import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
  CANDLES_DEFAULT_LIMIT,
  CANDLE_INTERVALS,
  CANDLE_INTERVAL_MS,
  CONTRACT_VERSION,
  DEFAULT_STALE_AFTER_MS,
  INITIAL_BALANCE_USD,
  INSTRUMENTS,
  LEVERAGE,
  MAX_TICK_FUTURE_MS,
  MIN_ORDER_USD,
  ORDER_REJECT_REASONS,
  SYMBOLS,
  accountClientMessageSchema,
  accountResponseSchema,
  accountSchema,
  accountServerMessageSchema,
  apiErrorSchema,
  candleSchema,
  candlesQuerySchema,
  candlesResponseSchema,
  closePositionPath,
  closePositionRequestSchema,
  getInstrument,
  instrumentSchema,
  loginRequestSchema,
  loginResponseSchema,
  marketClientMessageSchema,
  marketServerMessageSchema,
  orderSchema,
  parseWsMessage,
  placeOrderRequestSchema,
  positionSchema,
  staleAfterMs,
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

const accountView = { ...account, realizedPnl: 0, unrealizedPnl: 0 };

const order = {
  id,
  accountId: id,
  clientOrderId: id,
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
    expect(orderSchema.safeParse({ ...order, clientOrderId: null }).success).toBe(true);
    expect(positionSchema.safeParse(position).success).toBe(true);
  });

  it('la cuenta solo admite apalancamiento 1:1', () => {
    expect(accountSchema.safeParse({ ...account, leverage: 10 }).success).toBe(false);
  });

  it('solo se pueden crear órdenes market con cantidad positiva', () => {
    const request = {
      symbol: 'NVDA',
      side: 'sell',
      type: 'market',
      quantity: 3,
      clientOrderId: id,
    };
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

  it('mercado: status avisa si el precio está desactualizado y si se puede operar', () => {
    const status = {
      type: 'status',
      data: { symbol: 'NGASUSD', stale: true, marketOpen: false, ts: now },
    };
    expect(marketServerMessageSchema.parse(status)).toEqual(status);
    // v2: marketOpen es obligatorio (D-05).
    expect(
      marketServerMessageSchema.safeParse({
        type: 'status',
        data: { symbol: 'NGASUSD', stale: true, ts: now },
      }).success,
    ).toBe(false);
  });

  it('cuenta: snapshot con la vista de la cuenta, posiciones y órdenes', () => {
    const snapshot = {
      type: 'account.snapshot',
      account: accountView,
      positions: [position],
      orders: [order],
    };
    expect(accountServerMessageSchema.safeParse(snapshot).success).toBe(true);
    // v2: el snapshot lleva la vista con P&L, no la cuenta sola.
    expect(accountServerMessageSchema.safeParse({ ...snapshot, account }).success).toBe(false);
  });

  it('cuenta: eventos de orden ejecutada, rechazada, posición y saldo', () => {
    const rejected = {
      ...order,
      status: 'rejected',
      filledPrice: null,
      filledAt: null,
      rejectReason: 'stale_price',
    };
    const messages = [
      { type: 'order.filled', data: order },
      { type: 'order.rejected', data: rejected },
      { type: 'position.update', data: position },
      { type: 'position.closed', positionId: id },
      { type: 'account.update', data: accountView },
    ];
    for (const message of messages) {
      expect(accountServerMessageSchema.parse(message)).toEqual(message);
    }
    expect(
      accountServerMessageSchema.safeParse({ type: 'order.update', data: order }).success,
    ).toBe(false);
  });

  it('cuenta: sin mensaje auth, la sesión va en la cookie (D-04)', () => {
    expect(accountClientMessageSchema.safeParse({ type: 'ping' }).success).toBe(true);
    expect(accountClientMessageSchema.safeParse({ type: 'auth', token: 'x' }).success).toBe(false);
  });

  it('parseWsMessage devuelve null con JSON inválido o fuera de contrato', () => {
    expect(parseWsMessage(marketClientMessageSchema, 'no es json')).toBeNull();
    expect(parseWsMessage(marketClientMessageSchema, '{"type":"otro"}')).toBeNull();
    expect(parseWsMessage(marketClientMessageSchema, '{"type":"ping"}')).toEqual({ type: 'ping' });
  });
});

describe('contrato v2', () => {
  it('CONTRACT_VERSION = 2', () => {
    expect(CONTRACT_VERSION).toBe(2);
  });

  it('login por código: request y response sin token en el cuerpo', () => {
    expect(loginRequestSchema.parse({ code: ' ABCD-1234 ' })).toEqual({ code: 'ABCD-1234' });
    expect(loginRequestSchema.safeParse({ code: 'ab' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({}).success).toBe(false);
    const response = { accountId: id, expiresAt: now };
    expect(loginResponseSchema.parse({ ...response, token: 'secreto' })).toEqual(response);
  });

  it('accountView: saldo, equity y P&L realizado y no realizado', () => {
    const view = { ...account, equity: 100_500, realizedPnl: 200, unrealizedPnl: 300 };
    expect(accountResponseSchema.safeParse({ account: view, positions: [position] }).success).toBe(
      true,
    );
    expect(accountResponseSchema.safeParse({ account, positions: [] }).success).toBe(false);
  });

  describe('orden market por cantidad o por monto', () => {
    const base = { symbol: 'BTCUSD', side: 'buy', type: 'market', clientOrderId: id };

    it('acepta exactamente uno de quantity o amountUsd', () => {
      expect(placeOrderRequestSchema.safeParse({ ...base, quantity: 0.01 }).success).toBe(true);
      expect(placeOrderRequestSchema.safeParse({ ...base, amountUsd: 250 }).success).toBe(true);
      expect(
        placeOrderRequestSchema.safeParse({ ...base, quantity: 0.01, amountUsd: 250 }).success,
      ).toBe(false);
      expect(placeOrderRequestSchema.safeParse(base).success).toBe(false);
      expect(placeOrderRequestSchema.safeParse({ ...base, amountUsd: 0 }).success).toBe(false);
    });

    it('clientOrderId es obligatorio y es un UUID', () => {
      const withoutId = { symbol: 'BTCUSD', side: 'buy', type: 'market', quantity: 1 };
      expect(placeOrderRequestSchema.safeParse(withoutId).success).toBe(false);
      expect(
        placeOrderRequestSchema.safeParse({ ...base, quantity: 1, clientOrderId: 'abc' }).success,
      ).toBe(false);
    });

    it('el mínimo de 10 USD lo aplica el servidor con below_minimum, no el esquema', () => {
      expect(MIN_ORDER_USD).toBe(10);
      expect(placeOrderRequestSchema.safeParse({ ...base, amountUsd: 5 }).success).toBe(true);
      expect(ORDER_REJECT_REASONS).toContain('below_minimum');
      expect(ORDER_REJECT_REASONS).toContain('stale_price');
    });
  });

  it('cierre de posición: ruta y cuerpo con clientOrderId', () => {
    expect(closePositionPath(id)).toBe(`/positions/${id}/close`);
    expect(closePositionRequestSchema.safeParse({ clientOrderId: id }).success).toBe(true);
    expect(closePositionRequestSchema.safeParse({}).success).toBe(false);
  });

  describe('apiError', () => {
    const required = [
      'market_closed',
      'stale_price',
      'no_price',
      'insufficient_funds',
      'below_minimum',
      'validation_error',
      'unauthorized',
      'rate_limited',
    ];

    it('incluye los códigos mínimos y todos los motivos de rechazo, sin repetir', () => {
      for (const code of [...required, ...ORDER_REJECT_REASONS]) {
        expect(API_ERROR_CODES).toContain(code);
      }
      expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    });

    it('forma { error: { code, message } } con código estable', () => {
      const body = { error: { code: 'stale_price', message: 'Precio desactualizado.' } };
      expect(apiErrorSchema.parse(body)).toEqual(body);
      expect(apiErrorSchema.safeParse({ error: { code: 'otro', message: '' } }).success).toBe(
        false,
      );
      expect(apiErrorSchema.safeParse({ code: 'stale_price', message: '' }).success).toBe(false);
    });

    it('cada código tiene estado HTTP', () => {
      for (const code of API_ERROR_CODES) {
        expect(API_ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
      }
      expect(API_ERROR_HTTP_STATUS.validation_error).toBe(400);
      expect(API_ERROR_HTTP_STATUS.unauthorized).toBe(401);
      expect(API_ERROR_HTTP_STATUS.rate_limited).toBe(429);
      expect(API_ERROR_HTTP_STATUS.below_minimum).toBe(422);
    });
  });

  describe('velas REST', () => {
    it('intervalos con 4h, cada uno múltiplo del anterior', () => {
      expect(CANDLE_INTERVALS).toEqual(['1m', '5m', '15m', '1h', '4h', '1d']);
      expect(CANDLE_INTERVAL_MS['4h']).toBe(4 * 3_600_000);
      for (let i = 1; i < CANDLE_INTERVALS.length; i++) {
        const previous = CANDLE_INTERVAL_MS[CANDLE_INTERVALS[i - 1]!];
        expect(CANDLE_INTERVAL_MS[CANDLE_INTERVALS[i]!] % previous).toBe(0);
      }
    });

    it('convierte la query string y aplica el límite por defecto', () => {
      expect(
        candlesQuerySchema.parse({ symbol: 'BTCUSD', interval: '4h', from: '1000', to: '2000' }),
      ).toEqual({
        symbol: 'BTCUSD',
        interval: '4h',
        from: 1000,
        to: 2000,
        limit: CANDLES_DEFAULT_LIMIT,
      });
      expect(candlesQuerySchema.parse({ symbol: 'BTCUSD', interval: '1m', limit: '10' })).toEqual({
        symbol: 'BTCUSD',
        interval: '1m',
        limit: 10,
      });
    });

    it('rechaza límites fuera de rango, from > to e intervalos desconocidos', () => {
      const query = { symbol: 'BTCUSD', interval: '1m' };
      expect(candlesQuerySchema.safeParse({ ...query, limit: '0' }).success).toBe(false);
      expect(candlesQuerySchema.safeParse({ ...query, limit: '1001' }).success).toBe(false);
      expect(candlesQuerySchema.safeParse({ ...query, from: '2000', to: '1000' }).success).toBe(
        false,
      );
      expect(candlesQuerySchema.safeParse({ ...query, from: 'ayer' }).success).toBe(false);
      expect(candlesQuerySchema.safeParse({ ...query, interval: '2h' }).success).toBe(false);
    });

    it('respuesta con símbolo, intervalo y velas', () => {
      const candle = {
        symbol: 'BTCUSD',
        interval: '1h',
        openTime: now,
        open: 1,
        high: 2,
        low: 1,
        close: 2,
        volume: 3,
      };
      const response = { symbol: 'BTCUSD', interval: '1h', candles: [candle] };
      expect(candlesResponseSchema.parse(response)).toEqual(response);
    });
  });

  it('staleAfterMs(symbol) es la única fuente del umbral obsoleto (D-11)', () => {
    expect(staleAfterMs('BTCUSD')).toBe(DEFAULT_STALE_AFTER_MS);
    expect(staleAfterMs('EURUSD')).toBe(60_000);
    expect(staleAfterMs('NGASUSD')).toBe(60_000);
    for (const symbol of SYMBOLS) expect(staleAfterMs(symbol)).toBeGreaterThan(0);
    expect(MAX_TICK_FUTURE_MS).toBe(2_000);
  });
});
