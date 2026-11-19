/**
 * Arnés de QA sobre el motor puro de `apps/api/src/engine/`.
 *
 * Simula el libro contable de una cuenta aplicando órdenes al motor real y guarda solo lo que
 * el motor devuelve. No reimplementa el motor: las reglas esperadas viven en `expectedOutcome`,
 * escritas desde `docs/engine-rules.md`, para compararlas contra el código.
 */
import { INITIAL_BALANCE_USD, INSTRUMENTS, type Instrument } from '@coin/shared';
import fc from 'fast-check';
import {
  dec,
  executeMarketOrder,
  marketValue,
  ZERO,
  type Decimal,
  type MarketOrderResult,
  type RejectReason,
} from '../../apps/api/src/engine/index.js';

export const STALE_AFTER_MS = 30_000;
/**
 * Constantes del oráculo, copiadas de `docs/engine-rules.md` §5 y no del motor: si el motor
 * cambia una sin cambiar las reglas, R1 lo detecta.
 */
/** Fila 4 (D-11): adelanto máximo tolerado de un tick sobre la hora del servidor. */
export const MAX_FUTURE_SKEW_MS = 2_000;
/** Fila 6 (D-01): monto mínimo por orden, en centavos. */
export const MIN_ORDER_CENTS = 1_000n;
export const WINDOW = { startsAt: 1_800_000_000_000, endsAt: 1_800_000_000_000 + 2 * 86_400_000 };
/** Hora por defecto: dentro de la ventana de la competencia. */
export const NOW = WINDOW.startsAt + 3_600_000;

export type Command = {
  instrument: Instrument;
  tradable: boolean;
  side: 'buy' | 'sell';
  /** Cantidad como texto decimal exacto. Puede ser inválida a propósito. */
  quantity: string;
  /** `null` simula un símbolo sin precio. */
  tick: { bid: string; ask: string; ageMs: number } | null;
  now: number;
};

type SimPosition = { quantity: Decimal; costBasis: Decimal; realizedPnl: Decimal };

export type Sim = {
  balance: Decimal;
  /** Asientos contables, empezando por el depósito inicial. Solo se agregan. */
  ledger: Decimal[];
  positions: Map<string, SimPosition>;
  /** Último `bid` conocido por símbolo, para valorar. */
  lastBid: Map<string, Decimal>;
  /** Suma del P&L realizado de todos los fills. */
  realizedPnl: Decimal;
  fills: number;
};

export function newSim(): Sim {
  const initial = dec(INITIAL_BALANCE_USD);
  return {
    balance: initial,
    ledger: [initial],
    positions: new Map(),
    lastBid: new Map(),
    realizedPnl: ZERO,
    fills: 0,
  };
}

/** Ejecuta la orden en el motor real y, si se ejecutó, aplica el resultado al libro simulado. */
export function apply(sim: Sim, command: Command): MarketOrderResult {
  const symbol = command.instrument.symbol;
  const position = sim.positions.get(symbol) ?? null;
  if (command.tick) sim.lastBid.set(symbol, dec(command.tick.bid));

  const result = executeMarketOrder({
    now: command.now,
    window: WINDOW,
    instrument: {
      tradable: command.tradable,
      quantityPrecision: command.instrument.quantityPrecision,
      minQuantity: command.instrument.minQuantity,
    },
    tick: command.tick && {
      bid: command.tick.bid,
      ask: command.tick.ask,
      ts: command.now - command.tick.ageMs,
    },
    staleAfterMs: STALE_AFTER_MS,
    balance: sim.balance,
    position,
    side: command.side,
    quantity: command.quantity,
  });

  if (result.status === 'filled') {
    sim.ledger.push(result.ledgerAmount);
    sim.balance = result.balanceAfter;
    sim.realizedPnl = sim.realizedPnl.plus(result.realizedPnl);
    sim.fills += 1;
    if (result.position.closed) sim.positions.delete(symbol);
    else {
      sim.positions.set(symbol, {
        quantity: result.position.quantity,
        costBasis: result.position.costBasis,
        realizedPnl: result.position.realizedPnl,
      });
    }
  }
  return result;
}

export function ledgerSum(sim: Sim): Decimal {
  return sim.ledger.reduce((total, amount) => total.plus(amount), ZERO);
}

/** Valor de mercado de las posiciones abiertas, al último `bid` conocido. */
export function positionsValue(sim: Sim): Decimal {
  let total = ZERO;
  for (const [symbol, position] of sim.positions) {
    const bid = sim.lastBid.get(symbol);
    if (!bid) throw new Error(`Posición en ${symbol} sin precio: el arnés está mal.`);
    total = total.plus(marketValue(position.quantity, bid));
  }
  return total;
}

export function equityOf(sim: Sim): Decimal {
  return sim.balance.plus(positionsValue(sim));
}

export function unrealizedOf(sim: Sim): Decimal {
  let cost = ZERO;
  for (const position of sim.positions.values()) cost = cost.plus(position.costBasis);
  return positionsValue(sim).minus(cost);
}

/**
 * Resultado esperado según la tabla de validaciones de `docs/engine-rules.md`, sección 5.
 * Devuelve el motivo de rechazo o `'filled'`. Usa enteros (`BigInt`) y no el decimal del motor.
 */
export function expectedOutcome(sim: Sim, command: Command): RejectReason | 'filled' {
  // Filas 1 y 2.
  if (!command.tradable) return 'market_closed';
  if (command.now < WINDOW.startsAt || command.now >= WINDOW.endsAt) return 'market_closed';
  // Fila 3.
  if (!command.tick) return 'no_price';
  // Fila 4: viejo (`ahora − tick.ts > umbral`) o del futuro (`tick.ts − ahora > 2 s`).
  if (command.tick.ageMs > STALE_AFTER_MS || -command.tick.ageMs > MAX_FUTURE_SKEW_MS) {
    return 'stale_price';
  }

  // Fila 5. `minQuantity` es una unidad del último decimal permitido.
  const { quantityPrecision } = command.instrument;
  const units = toScaled(command.quantity, quantityPrecision);
  if (units === null || units < 1n) return 'invalid_quantity';

  // Fila 6 (D-01): el monto ya redondeado en contra del participante, salvo cerrar todo.
  const position = sim.positions.get(command.instrument.symbol);
  const held = position ? toScaledOrThrow(position.quantity.toFixed(), quantityPrecision) : 0n;
  const cents = notionalCents(command.side, units, command.tick, quantityPrecision);
  const closesPosition = command.side === 'sell' && held > 0n && units === held;
  if (cents < MIN_ORDER_CENTS && !closesPosition) return 'below_minimum';

  // Filas 7 y 8.
  if (command.side === 'buy') {
    const balanceCents = toScaledOrThrow(sim.balance.toFixed(), 2);
    return cents > balanceCents ? 'insufficient_funds' : 'filled';
  }
  return held <= 0n || units > held ? 'insufficient_position' : 'filled';
}

/**
 * Monto de una ejecución en centavos (`docs/engine-rules.md` §4, D-01): `unidades × ask` al
 * techo en una compra y `unidades × bid` al piso en una venta.
 */
export function notionalCents(
  side: 'buy' | 'sell',
  units: bigint,
  tick: { bid: string; ask: string },
  quantityPrecision: number,
): bigint {
  const scale = quantityPrecision + 8;
  return side === 'buy'
    ? ceilToCents(units * toScaledOrThrow(tick.ask, 8), scale)
    : floorToCents(units * toScaledOrThrow(tick.bid, 8), scale);
}

/** Monto de una orden concreta en centavos. Lanza si no tiene tick o la cantidad no cabe. */
export function commandNotionalCents(command: Command): bigint {
  if (!command.tick) throw new Error('Orden sin tick: no tiene monto.');
  const { quantityPrecision } = command.instrument;
  const units = toScaledOrThrow(command.quantity, quantityPrecision);
  return notionalCents(command.side, units, command.tick, quantityPrecision);
}

/** Convierte un decimal en texto a entero con `scale` decimales. `null` si no cabe exacto. */
export function toScaled(value: string, scale: number): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  const trimmed = fraction.replace(/0+$/, '');
  if (trimmed.length > scale) return null;
  const scaled = BigInt(`${whole}${trimmed.padEnd(scale, '0')}`);
  return sign ? -scaled : scaled;
}

function toScaledOrThrow(value: string, scale: number): bigint {
  const scaled = toScaled(value, scale);
  if (scaled === null) throw new Error(`"${value}" no cabe en ${scale} decimales.`);
  return scaled;
}

/**
 * Redondea a centavos, la mitad hacia arriba, un entero no negativo con `scale` decimales.
 * Desde D-01 solo vale para lo que no mueve el saldo: valor de mercado y costo liberado.
 */
export function roundHalfUpToCents(value: bigint, scale: number): bigint {
  const divisor = 10n ** BigInt(scale - 2);
  return (value + divisor / 2n) / divisor;
}

/** Redondea a centavos hacia arriba un entero no negativo con `scale` decimales (compra, D-01). */
export function ceilToCents(value: bigint, scale: number): bigint {
  const divisor = 10n ** BigInt(scale - 2);
  return (value + divisor - 1n) / divisor;
}

/** Redondea a centavos hacia abajo un entero no negativo con `scale` decimales (venta, D-01). */
export function floorToCents(value: bigint, scale: number): bigint {
  return value / 10n ** BigInt(scale - 2);
}

// --- Generadores ---

/** Entero `n` como decimal con `scale` decimales, sin pasar por `number`. */
export function scaled(n: number | bigint, scale: number): string {
  const digits = n.toString().padStart(scale + 1, '0');
  return scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export const instrumentArb: fc.Arbitrary<Instrument> = fc.constantFrom(...INSTRUMENTS);

/**
 * Tick con `bid > 0` y `ask ≥ bid`, en la precisión de precio del instrumento. Su edad va de
 * `minAgeMs` a `maxAgeMs`; una edad negativa es un tick fechado en el futuro.
 */
export function tickArb(instrument: Instrument, maxAgeMs = 0, minAgeMs = 0) {
  return fc
    .record({
      bidTicks: fc.integer({ min: 1, max: 20_000_000 }),
      spreadTicks: fc.integer({ min: 0, max: 200 }),
      ageMs: fc.integer({ min: minAgeMs, max: maxAgeMs }),
    })
    .map(({ bidTicks, spreadTicks, ageMs }) => ({
      bid: scaled(bidTicks, instrument.pricePrecision),
      ask: scaled(bidTicks + spreadTicks, instrument.pricePrecision),
      ageMs,
    }));
}

/**
 * Tick fechado en el futuro (D-11): dentro y fuera de los 2 s tolerados, más los dos bordes
 * exactos (+2.000 ms se acepta, +2.001 ms se rechaza).
 */
export function futureTickArb(instrument: Instrument) {
  return fc.oneof(
    tickArb(instrument, -1, -3 * MAX_FUTURE_SKEW_MS),
    tickArb(instrument, -MAX_FUTURE_SKEW_MS, -MAX_FUTURE_SKEW_MS),
    tickArb(instrument, -MAX_FUTURE_SKEW_MS - 1, -MAX_FUTURE_SKEW_MS - 1),
  );
}

/** Cantidad válida: múltiplo entero de la unidad mínima del instrumento. */
export function quantityArb(instrument: Instrument, maxUnits = 500_000): fc.Arbitrary<string> {
  return fc
    .integer({ min: 1, max: maxUnits })
    .map((units) => scaled(units, instrument.quantityPrecision));
}

/** Cantidades que el motor debe rechazar: cero, negativas o con decimales de más. */
export function invalidQuantityArb(instrument: Instrument): fc.Arbitrary<string> {
  const extra = instrument.quantityPrecision + 1;
  return fc.oneof(
    fc.constant('0'),
    fc
      .integer({ min: 1, max: 1_000_000 })
      .map((n) => `-${scaled(n, instrument.quantityPrecision)}`),
    // Último dígito distinto de cero: un decimal más de los permitidos.
    fc
      .tuple(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 1, max: 9 }))
      .map(([n, last]) => scaled(n * 10 + last, extra)),
  );
}

/**
 * Intención de orden. La cantidad se resuelve contra el estado de la cuenta en `materialize`,
 * para que las secuencias generadas compren montos pagables y vendan lo que de verdad tienen.
 */
export type Intent = Omit<Command, 'side' | 'quantity'> & {
  size:
    | { kind: 'budget'; usd: number }
    | { kind: 'held'; permille: number }
    | { kind: 'raw'; side: 'buy' | 'sell'; quantity: string };
};

/** Convierte la intención en una orden concreta para el estado actual de la cuenta. */
export function materialize(sim: Sim, intent: Intent): Command {
  const { size, ...rest } = intent;
  const { quantityPrecision, pricePrecision, symbol } = intent.instrument;
  if (size.kind === 'raw') return { ...rest, side: size.side, quantity: size.quantity };

  if (size.kind === 'budget') {
    // Compra por un presupuesto en USD: las unidades que alcanzan al `ask`, mínimo una.
    const ask = intent.tick ? toScaledOrThrow(intent.tick.ask, pricePrecision) : 0n;
    const units =
      ask > 0n ? (BigInt(size.usd) * 10n ** BigInt(pricePrecision + quantityPrecision)) / ask : 1n;
    return { ...rest, side: 'buy', quantity: scaled(units < 1n ? 1n : units, quantityPrecision) };
  }

  // Venta de una fracción de lo que hay (1000 ‰ cierra la posición). Sin posición: una unidad.
  const position = sim.positions.get(symbol);
  const held = position ? toScaledOrThrow(position.quantity.toFixed(), quantityPrecision) : 0n;
  const units = (held * BigInt(size.permille)) / 1000n;
  return { ...rest, side: 'sell', quantity: scaled(units < 1n ? 1n : units, quantityPrecision) };
}

const sizeArb = (instrument: Instrument): fc.Arbitrary<Intent['size']> =>
  fc.oneof(
    {
      weight: 5,
      arbitrary: fc
        .integer({ min: 1, max: 40_000 })
        .map((usd) => ({ kind: 'budget' as const, usd })),
    },
    {
      weight: 5,
      arbitrary: fc
        .oneof(fc.constant(1000), fc.integer({ min: 1, max: 1200 }))
        .map((permille) => ({ kind: 'held' as const, permille })),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('raw' as const),
        side: fc.constantFrom('buy' as const, 'sell' as const),
        quantity: quantityArb(instrument),
      }),
    },
  );

/**
 * Orden en condiciones normales: mercado abierto y tick vigente. Vigente incluye un tick hasta
 * 2 s en el futuro (D-11): relojes un poco desalineados no deben cambiar nada.
 */
function happyIntentArb(instrument: Instrument): fc.Arbitrary<Intent> {
  return fc.record({
    instrument: fc.constant(instrument),
    tradable: fc.constant(true),
    size: sizeArb(instrument),
    tick: fc.oneof(
      { weight: 9, arbitrary: tickArb(instrument) },
      { weight: 1, arbitrary: tickArb(instrument, -1, -MAX_FUTURE_SKEW_MS) },
    ),
    now: fc.constant(NOW),
  });
}

/**
 * Orden cualquiera: incluye mercado cerrado, sin precio, precio obsoleto (viejo o del futuro) y
 * cantidad inválida.
 */
function anyIntentArb(instrument: Instrument): fc.Arbitrary<Intent> {
  return fc.record({
    instrument: fc.constant(instrument),
    tradable: fc.oneof({ weight: 12, arbitrary: fc.constant(true) }, fc.constant(false)),
    size: fc.oneof(
      { weight: 8, arbitrary: sizeArb(instrument) },
      fc.record({
        kind: fc.constant('raw' as const),
        side: fc.constantFrom('buy' as const, 'sell' as const),
        quantity: invalidQuantityArb(instrument),
      }),
    ),
    tick: fc.oneof(
      { weight: 9, arbitrary: tickArb(instrument) },
      { weight: 2, arbitrary: tickArb(instrument, 2 * STALE_AFTER_MS) },
      { weight: 2, arbitrary: futureTickArb(instrument) },
      fc.constant(null),
    ),
    now: fc.oneof(
      { weight: 12, arbitrary: fc.constant(NOW) },
      fc.constantFrom(
        WINDOW.startsAt - 1,
        WINDOW.startsAt,
        WINDOW.endsAt - 1,
        WINDOW.endsAt,
        WINDOW.endsAt + 86_400_000,
      ),
    ),
  });
}

/** Secuencia de órdenes sobre uno a tres símbolos, para que compras y ventas se encuentren. */
function sequenceOf(intentArb: (instrument: Instrument) => fc.Arbitrary<Intent>) {
  return fc
    .uniqueArray(instrumentArb, { minLength: 1, maxLength: 3, selector: (item) => item.symbol })
    .chain((instruments) =>
      fc.array(fc.constantFrom(...instruments).chain(intentArb), { minLength: 1, maxLength: 60 }),
    );
}

export const happySequenceArb = sequenceOf(happyIntentArb);
export const anySequenceArb = sequenceOf(anyIntentArb);

/**
 * Primera compra de una cuenta nueva, por un monto que el saldo inicial alcanza a pagar y que
 * llega al mínimo de 10 USD (D-01). El presupuesto no basta para filtrar: `materialize` redondea
 * las unidades hacia abajo, así que se filtra por el monto al techo.
 */
export const firstBuyArb: fc.Arbitrary<Command> = instrumentArb.chain((instrument) =>
  fc
    .record({
      instrument: fc.constant(instrument),
      tradable: fc.constant(true),
      size: fc.integer({ min: 1, max: 40_000 }).map((usd) => ({ kind: 'budget' as const, usd })),
      tick: tickArb(instrument),
      now: fc.constant(NOW),
    })
    .map((intent) => materialize(newSim(), intent))
    .filter((command) => commandNotionalCents(command) >= MIN_ORDER_CENTS),
);

/**
 * Escenario de DEF-001: un símbolo, un tick fijo y compras y ventas pequeñas (hasta 50 unidades
 * mínimas) en cualquier orden. A precio fijo, ninguna secuencia debería subir el equity.
 */
export const fixedPriceScenarioArb = instrumentArb.chain((instrument) =>
  fc.record({
    instrument: fc.constant(instrument),
    tick: tickArb(instrument),
    orders: fc.array(
      fc.record({
        side: fc.constantFrom('buy' as const, 'sell' as const),
        quantity: quantityArb(instrument, 50),
      }),
      { minLength: 1, maxLength: 80 },
    ),
  }),
);
