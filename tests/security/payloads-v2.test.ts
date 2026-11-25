/**
 * Payloads manipulados contra los esquemas del contrato v2 (`@coin/shared`): login, orden,
 * cierre de posición y consulta de velas. Cada propiedad dice qué acepta el contrato, comprueba
 * que lo demás se rechaza y que lo aceptado nunca trae campos que fija el servidor.
 * No necesita base de datos ni servidor.
 */
import {
  CANDLE_INTERVALS,
  CANDLES_DEFAULT_LIMIT,
  CANDLES_MAX_LIMIT,
  SYMBOLS,
  candlesQuerySchema,
  closePositionRequestSchema,
  loginRequestSchema,
  placeOrderRequestSchema,
} from '@coin/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_SET_KEYS,
  RUNS,
  amountKey,
  anyJsonArb,
  anyQueryValueArb,
  badPositiveNumberArb,
  badUuidArb,
  clientSetFieldsArb,
  fakeSymbolArb,
  intervalArb,
  loginCodeArb,
  positiveNumberArb,
  queryLimitArb,
  queryTimestampArb,
  symbolArb,
  uuidArb,
  validOrderArb,
  withoutKey,
} from './payload-arbitraries.js';

const symbols: readonly unknown[] = SYMBOLS;
const intervals: readonly unknown[] = CANDLE_INTERVALS;

/**
 * Consulta de velas con cada parámetro válido (más probable) o manipulado, para que V2 vea
 * suficientes consultas aceptadas (SG1 lo exige).
 */
const queryParam = (valid: fc.Arbitrary<string>, optional: boolean): fc.Arbitrary<unknown> => {
  const required = fc.oneof(
    { weight: 4, arbitrary: valid },
    { weight: 1, arbitrary: anyQueryValueArb },
  );
  return optional
    ? fc.oneof({ weight: 5, arbitrary: required }, { weight: 1, arbitrary: fc.constant(undefined) })
    : required;
};
const manipulatedQueryArb = fc.record({
  symbol: queryParam(symbolArb, false),
  interval: queryParam(intervalArb, false),
  from: queryParam(queryTimestampArb, true),
  to: queryParam(queryTimestampArb, true),
  limit: queryParam(queryLimitArb, true),
});

function expectRejected(
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) {
  expect(schema.safeParse(value).success).toBe(false);
}

describe('login (`loginRequestSchema`)', () => {
  it('L1: acepta un código solo si, sin espacios alrededor, tiene de 4 a 64 caracteres', () => {
    fc.assert(
      fc.property(loginCodeArb, (code) => {
        const trimmed = code.trim();
        // "Caracteres" son puntos de código, como los cuenta zod 4: 😀 cuenta 1, no 2.
        const characters = [...trimmed].length;
        const result = loginRequestSchema.safeParse({ code });
        expect(result.success).toBe(characters >= 4 && characters <= 64);
        if (result.success) expect(result.data.code).toBe(trimmed);
      }),
      {
        ...RUNS,
        examples: [['  ab  '], [`${' '.repeat(30)}ABCDE${' '.repeat(30)}`], ['a'.repeat(65)]],
      },
    );
  });

  it('L2: rechaza un código que no es texto o que no viene', () => {
    fc.assert(
      fc.property(
        anyJsonArb.filter((value) => typeof value !== 'string'),
        (code) => {
          expectRejected(loginRequestSchema, { code });
          expectRejected(loginRequestSchema, {});
        },
      ),
      RUNS,
    );
  });

  it('L3: los campos extra no pasan; solo queda `code`', () => {
    fc.assert(
      fc.property(clientSetFieldsArb, (extra) => {
        const result = loginRequestSchema.safeParse({ ...extra, code: 'ABCDE-FGHJK' });
        expect(result.success).toBe(true);
        if (result.success) expect(Object.keys(result.data)).toEqual(['code']);
      }),
      RUNS,
    );
  });
});

describe('orden (`placeOrderRequestSchema`)', () => {
  it('O1: acepta una orden válida tal como llega', () => {
    fc.assert(
      fc.property(validOrderArb, (order) => {
        const result = placeOrderRequestSchema.safeParse(order);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toEqual(order);
      }),
      RUNS,
    );
  });

  it('O2: rechaza un monto que no es un número positivo y finito', () => {
    fc.assert(
      fc.property(validOrderArb, badPositiveNumberArb, (order, bad) => {
        expectRejected(placeOrderRequestSchema, { ...order, [amountKey(order)]: bad });
      }),
      RUNS,
    );
  });

  it('O3: rechaza `quantity` y `amountUsd` juntos, o ninguno de los dos', () => {
    fc.assert(
      fc.property(validOrderArb, positiveNumberArb, (order, other) => {
        expectRejected(placeOrderRequestSchema, { ...order, quantity: other, amountUsd: other });
        expectRejected(placeOrderRequestSchema, withoutKey(order, amountKey(order)));
      }),
      RUNS,
    );
  });

  it('O4: rechaza un símbolo que no está en el catálogo', () => {
    fc.assert(
      fc.property(validOrderArb, fakeSymbolArb, (order, symbol) => {
        expectRejected(placeOrderRequestSchema, { ...order, symbol });
      }),
      RUNS,
    );
  });

  it('O5: rechaza un lado o un tipo de orden que el contrato no tiene', () => {
    const badSide = fc.oneof(
      fc.string().filter((side) => side !== 'buy' && side !== 'sell'),
      fc.constantFrom<unknown>('BUY', 'Buy', 'short', 'sell ', null, 1),
    );
    const badType = fc.oneof(
      fc.string().filter((type) => type !== 'market'),
      fc.constantFrom<unknown>('limit', 'stop', 'MARKET', ' market', null, 0),
    );
    fc.assert(
      fc.property(validOrderArb, badSide, badType, (order, side, type) => {
        expectRejected(placeOrderRequestSchema, { ...order, side });
        expectRejected(placeOrderRequestSchema, { ...order, type });
      }),
      RUNS,
    );
  });

  it('O6: rechaza un `clientOrderId` que no es UUID o que no viene', () => {
    fc.assert(
      fc.property(validOrderArb, badUuidArb, (order, clientOrderId) => {
        expectRejected(placeOrderRequestSchema, { ...order, clientOrderId });
        expectRejected(placeOrderRequestSchema, withoutKey(order, 'clientOrderId'));
      }),
      RUNS,
    );
  });

  it('O7: el precio, la cuenta o el estado que manda el cliente nunca salen del esquema', () => {
    fc.assert(
      fc.property(validOrderArb, clientSetFieldsArb, (order, extra) => {
        const result = placeOrderRequestSchema.safeParse({ ...extra, ...order });
        expect(result.success).toBe(true);
        if (!result.success) return;
        for (const key of CLIENT_SET_KEYS) expect(result.data).not.toHaveProperty(key);
        expect(result.data).toEqual(order);
      }),
      RUNS,
    );
  });

  it('O8: un cuerpo con `__proto__` o `constructor` no contamina prototipos', () => {
    fc.assert(
      fc.property(validOrderArb, (order) => {
        const body: unknown = JSON.parse(
          JSON.stringify(order).replace(
            /^\{/,
            '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},',
          ),
        );
        const result = placeOrderRequestSchema.safeParse(body);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        if (!result.success) return;
        expect(Object.getPrototypeOf(result.data)).toBe(Object.prototype);
        expect(Object.hasOwn(result.data, '__proto__')).toBe(false);
        expect(Object.hasOwn(result.data, 'constructor')).toBe(false);
      }),
      RUNS,
    );
  });
});

describe('cierre de posición (`closePositionRequestSchema`)', () => {
  it('C1: solo pasa `clientOrderId`; la cantidad, el precio y lo demás se descartan', () => {
    fc.assert(
      fc.property(
        uuidArb,
        clientSetFieldsArb,
        fc.record({ quantity: anyJsonArb, symbol: anyJsonArb, side: anyJsonArb }),
        (clientOrderId, extra, more) => {
          const result = closePositionRequestSchema.safeParse({ ...extra, ...more, clientOrderId });
          expect(result.success).toBe(true);
          if (result.success) expect(result.data).toEqual({ clientOrderId });
        },
      ),
      RUNS,
    );
  });

  it('C2: rechaza un `clientOrderId` que no es UUID o que no viene', () => {
    fc.assert(
      fc.property(badUuidArb, (clientOrderId) => {
        expectRejected(closePositionRequestSchema, { clientOrderId });
        expectRejected(closePositionRequestSchema, {});
      }),
      RUNS,
    );
  });
});

describe('consulta de velas (`candlesQuerySchema`)', () => {
  it('V1: acepta una consulta válida y convierte los números de la query', () => {
    fc.assert(
      fc.property(
        symbolArb,
        intervalArb,
        fc.option(fc.tuple(queryTimestampArb, queryTimestampArb), { nil: undefined }),
        fc.option(queryLimitArb, { nil: undefined }),
        (symbol, interval, range, limit) => {
          const [from, to] = range ? [...range].sort((a, b) => Number(a) - Number(b)) : [];
          const query = { symbol, interval, from, to, limit };
          const result = candlesQuerySchema.safeParse(query);
          expect(result.success).toBe(true);
          if (!result.success) return;
          expect(result.data).toEqual({
            symbol,
            interval,
            from: from === undefined ? undefined : Number(from),
            to: to === undefined ? undefined : Number(to),
            limit: limit === undefined ? CANDLES_DEFAULT_LIMIT : Number(limit),
          });
        },
      ),
      RUNS,
    );
  });

  it('V2: lo que pasa el esquema siempre queda dentro de los límites del contrato', () => {
    fc.assert(
      fc.property(manipulatedQueryArb, clientSetFieldsArb, (query, extra) => {
        const result = candlesQuerySchema.safeParse({ ...extra, ...query });
        if (!result.success) return;
        const { symbol, interval, from, to, limit } = result.data;
        expect(symbols).toContain(symbol);
        expect(intervals).toContain(interval);
        expect(Number.isInteger(limit) && limit >= 1 && limit <= CANDLES_MAX_LIMIT).toBe(true);
        for (const time of [from, to]) {
          if (time !== undefined) expect(Number.isInteger(time) && time >= 0).toBe(true);
        }
        if (from !== undefined && to !== undefined) expect(from).toBeLessThanOrEqual(to);
        expect(Object.keys(result.data).sort()).toEqual(
          ['from', 'interval', 'limit', 'symbol', 'to'].filter((key) => key in result.data),
        );
      }),
      RUNS,
    );
  });

  it('V3: rechaza `limit` fuera de 1–1000 o no entero, rangos invertidos y valores falsos', () => {
    fc.assert(
      fc.property(
        symbolArb,
        intervalArb,
        fc.constantFrom('0', String(CANDLES_MAX_LIMIT + 1), '-1', '1.5', 'NaN', 'Infinity', 'abc'),
        fc.integer({ min: 1, max: 1_000_000 }),
        fakeSymbolArb,
        fc.constantFrom('2m', '1M', '1H', '1w', '', '1d '),
        (symbol, interval, limit, gap, fakeSymbol, fakeInterval) => {
          expectRejected(candlesQuerySchema, { symbol, interval, limit });
          expectRejected(candlesQuerySchema, { symbol, interval, from: String(gap), to: '0' });
          expectRejected(candlesQuerySchema, { symbol, interval, from: '-1' });
          expectRejected(candlesQuerySchema, { symbol, interval, to: '1.5' });
          expectRejected(candlesQuerySchema, { symbol: fakeSymbol, interval });
          expectRejected(candlesQuerySchema, { symbol, interval: fakeInterval });
        },
      ),
      RUNS,
    );
  });

  it('V4: un `from`, `to` o `limit` vacío o en blanco cuenta como no enviado; `limit` usa el default', () => {
    // Espacios que `String.trim` quita: así llega `limit=` o `limit=%20%20` en la query.
    const blankArb = fc
      .array(fc.constantFrom(' ', '\t', '\n', '\r', ' ', ' ', '　', '﻿'), {
        maxLength: 6,
      })
      .map((chars) => chars.join(''));
    // Qué parámetros llegan en blanco: al menos uno, solos o combinados.
    const blankKeysArb = fc.subarray(['from', 'to', 'limit'], { minLength: 1 });
    fc.assert(
      fc.property(
        symbolArb,
        intervalArb,
        blankKeysArb,
        blankArb,
        (symbol, interval, keys, blank) => {
          const query = Object.fromEntries([
            ['symbol', symbol],
            ['interval', interval],
            ...keys.map((key) => [key, blank]),
          ]);
          const result = candlesQuerySchema.safeParse(query);
          expect(result.success, JSON.stringify(query)).toBe(true);
          if (!result.success) return;
          expect(result.data).toEqual({
            symbol,
            interval,
            from: undefined,
            to: undefined,
            limit: CANDLES_DEFAULT_LIMIT,
          });
        },
      ),
      {
        ...RUNS,
        examples: [
          ['BTCUSD', '1m', ['limit'], ''],
          ['BTCUSD', '1m', ['limit'], '   '],
        ],
      },
    );
  });
});

describe('generadores', () => {
  it('SG1: los generadores mixtos producen casos aceptados y rechazados, no solo unos', () => {
    const split = (
      values: unknown[],
      schema: { safeParse(value: unknown): { success: boolean } },
    ) => {
      const accepted = values.filter((value) => schema.safeParse(value).success).length;
      return { accepted, rejected: values.length - accepted };
    };
    const login = split(
      fc.sample(loginCodeArb, RUNS).map((code) => ({ code })),
      loginRequestSchema,
    );
    const candles = split(fc.sample(manipulatedQueryArb, RUNS), candlesQuerySchema);
    for (const [name, counts] of Object.entries({ login, candles })) {
      expect(counts.accepted, `${name} aceptados`).toBeGreaterThanOrEqual(50);
      expect(counts.rejected, `${name} rechazados`).toBeGreaterThanOrEqual(50);
    }
  });
});
