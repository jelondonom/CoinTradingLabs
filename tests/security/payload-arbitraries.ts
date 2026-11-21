/**
 * Generadores de payloads para `tests/security/`. Producen cuerpos válidos según el contrato v2
 * (`@coin/shared`) y versiones manipuladas de cada campo. Los valores válidos salen del contrato
 * (`SYMBOLS`, `CANDLE_INTERVALS`, `CANDLES_MAX_LIMIT`), sin copias.
 */
import { CANDLE_INTERVALS, CANDLES_MAX_LIMIT, SYMBOLS } from '@coin/shared';
import fc from 'fast-check';

/** Semilla fija, como en `tests/properties/`. */
export const RUNS = { seed: 20270101, numRuns: 300 } as const;

const symbols: readonly string[] = SYMBOLS;

/**
 * Campos que el cliente no debe poder fijar: el servidor los calcula. Si alguno pasara el esquema,
 * el cliente podría elegir su precio, su cuenta o el estado de la orden.
 */
export const CLIENT_SET_KEYS = [
  'price',
  'filledPrice',
  'notional',
  'status',
  'rejectReason',
  'accountId',
  'userId',
  'balance',
  'positionId',
  'filledAt',
] as const;

/** Claves con las que se intenta contaminar el prototipo de los objetos. */
export const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

/** Número positivo y finito: lo único que aceptan `quantity` y `amountUsd`. */
export const positiveNumberArb = fc.double({
  min: Number.MIN_VALUE,
  max: Number.MAX_VALUE,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Valores que ningún campo "número positivo y finito" debe aceptar. */
export const badPositiveNumberArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(0, -0, Number.NaN, Infinity, -Infinity, null, true, false),
  fc.double({ max: 0 }),
  // Números escritos como texto, incluidos los que `Number()` sí convertiría.
  fc.constantFrom('1', '0.5', '1e3', '0x10', ' 7 ', '', 'NaN', 'Infinity'),
  fc.string(),
  fc.constantFrom<unknown>([], [1], {}, { value: 1 }),
);

/** UUID válido, como lo genera un cliente con `crypto.randomUUID()`. */
export const uuidArb = fc.uuid();

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valores que no tienen forma de UUID: el contrato los rechaza en `clientOrderId`. */
export const badUuidArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string().filter((value) => !UUID_SHAPE.test(value)),
  uuidArb.map((id) => `{${id}}`),
  uuidArb.map((id) => id.replaceAll('-', '')),
  uuidArb.map((id) => `${id} `),
  uuidArb.map((id) => ` ${id}`),
  uuidArb.map((id) => id.slice(0, -1)),
  uuidArb.map((id) => `${id}0`),
  uuidArb.map((id) => `${id}\u0000`),
  fc.constantFrom<unknown>(null, 0, 1, true, [], {}),
  uuidArb.map((id) => [id]),
);

/** Letras latinas y su gemela visual en cirílico (А, В, С, Е, Н, К, М, О, Р, Т, Х). */
const LOOKALIKES: Record<string, string> = {
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
};

function withLookalike(symbol: string): string {
  const index = [...symbol].findIndex((char) => char in LOOKALIKES);
  if (index < 0) return `${symbol}?`;
  return `${symbol.slice(0, index)}${LOOKALIKES[symbol[index]!]}${symbol.slice(index + 1)}`;
}

/** Símbolo del catálogo. */
export const symbolArb = fc.constantFrom(...SYMBOLS);

/** Símbolos falsos: parecidos a uno del catálogo o inventados. Ninguno está en `SYMBOLS`. */
export const fakeSymbolArb: fc.Arbitrary<unknown> = fc
  .oneof(
    symbolArb.map((symbol) => symbol.toLowerCase()),
    symbolArb.map((symbol) => ` ${symbol}`),
    symbolArb.map((symbol) => `${symbol} `),
    symbolArb.map((symbol) => `${symbol}\u0000`),
    symbolArb.map((symbol) => `${symbol}T`),
    symbolArb.map(withLookalike),
    symbolArb.map((symbol) => [symbol]),
    fc.string(),
    fc.constantFrom<unknown>(null, 0, true, {}),
  )
  .filter((value) => !(typeof value === 'string' && symbols.includes(value)));

/** Texto de cualquier código Unicode, incluidos controles y mitades de pares sustitutos. */
export const anyTextArb = (maxLength: number) => fc.string({ unit: 'binary', maxLength });

/** Espacios que `String.prototype.trim` quita: espacio, tab, salto de línea, NBSP, BOM. */
const trimmableArb = fc.string({
  unit: fc.constantFrom(' ', '\t', '\n', '\r', ' ', '﻿', ' '),
  maxLength: 6,
});

/** Código de inscripción con espacios alrededor y largo variable, a ambos lados de 4 y 64. */
export const loginCodeArb = fc
  .tuple(trimmableArb, anyTextArb(80), trimmableArb)
  .map(([before, core, after]) => `${before}${core}${after}`);

/** Valores de un campo que el cliente puede inventar con cualquier JSON. */
export const anyJsonArb = fc.jsonValue({ maxDepth: 2 });

/** Campos que pone el cliente, con valores cualquiera. */
export const clientSetFieldsArb = fc.dictionary(fc.constantFrom(...CLIENT_SET_KEYS), anyJsonArb, {
  minKeys: 1,
});

/** Intervalo del contrato. */
export const intervalArb = fc.constantFrom(...CANDLE_INTERVALS);

/** Marca de tiempo válida escrita como en una query string. */
export const queryTimestampArb = fc.integer({ min: 0, max: 4_102_444_800_000 }).map(String);

/** `limit` válido escrito como en una query string. */
export const queryLimitArb = fc.integer({ min: 1, max: CANDLES_MAX_LIMIT }).map(String);

/**
 * Valor cualquiera de un parámetro de la query: texto (válido o no), un arreglo como el que deja
 * un parámetro repetido, o un tipo que un parser de query nunca produciría.
 */
export const anyQueryValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer().map(String),
  fc.double().map(String),
  fc.constantFrom('', '0', '-1', '1.5', '1e3', '0x10', ' 7 ', 'NaN', 'Infinity', '9'.repeat(400)),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.constantFrom<unknown>(null, 1, true, {}),
);

/** Orden válida según el contrato: exactamente uno de `quantity` o `amountUsd`. */
export const validOrderArb: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    symbol: symbolArb,
    side: fc.constantFrom('buy', 'sell'),
    type: fc.constant('market'),
    size: fc.oneof(
      positiveNumberArb.map((quantity) => ({ quantity })),
      positiveNumberArb.map((amountUsd) => ({ amountUsd })),
    ),
    clientOrderId: uuidArb,
  })
  .map(({ size, ...order }) => ({ ...order, ...size }));

/** Campo que lleva el monto de la orden: `quantity` o `amountUsd`. */
export function amountKey(order: Record<string, unknown>): 'quantity' | 'amountUsd' {
  return 'quantity' in order ? 'quantity' : 'amountUsd';
}

/** Copia del objeto sin `key`. */
export function withoutKey(object: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _removed, ...rest } = object;
  return rest;
}

/** Cuerpos de orden: válidos o con un campo manipulado, como los mandaría un cliente alterado. */
export const orderBodyArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  validOrderArb,
  fc
    .tuple(validOrderArb, badPositiveNumberArb)
    .map(([order, bad]) => ({ ...order, [amountKey(order)]: bad })),
  fc.tuple(validOrderArb, fakeSymbolArb).map(([order, symbol]) => ({ ...order, symbol })),
  fc
    .tuple(validOrderArb, badUuidArb)
    .map(([order, clientOrderId]) => ({ ...order, clientOrderId })),
  validOrderArb.map((order) => withoutKey(order, 'clientOrderId')),
  fc.tuple(validOrderArb, clientSetFieldsArb).map(([order, extra]) => ({ ...extra, ...order })),
);
