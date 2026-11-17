import { ZERO, dec, roundMoney, roundPrice, type Decimal, type DecimalInput } from './decimal.js';

/** Motivos de rechazo, en el orden en que se evalúan (ver `docs/engine-rules.md`, sección 5). */
export type RejectReason =
  | 'market_closed'
  | 'no_price'
  | 'stale_price'
  | 'invalid_quantity'
  | 'insufficient_funds'
  | 'insufficient_position';

export type EngineTick = {
  bid: DecimalInput;
  ask: DecimalInput;
  /** Marca de tiempo del tick, en milisegundos desde epoch. */
  ts: number;
};

/** Posición larga abierta de la cuenta en el símbolo de la orden. */
export type OpenPosition = {
  quantity: DecimalInput;
  costBasis: DecimalInput;
  realizedPnl: DecimalInput;
};

export type MarketOrderInput = {
  /** Hora del servidor, en milisegundos desde epoch. El motor no lee el reloj. */
  now: number;
  /** Ventana de la competencia: se opera en `[startsAt, endsAt)`. */
  window: { startsAt: number; endsAt: number };
  instrument: { tradable: boolean; quantityPrecision: number; minQuantity: DecimalInput };
  /** Último tick del servidor, o `null` si el símbolo aún no tiene precio. */
  tick: EngineTick | null;
  /** Antigüedad máxima del tick, en milisegundos. */
  staleAfterMs: number;
  balance: DecimalInput;
  position: OpenPosition | null;
  side: 'buy' | 'sell';
  quantity: DecimalInput;
};

export type PositionAfter = {
  quantity: Decimal;
  costBasis: Decimal;
  avgEntryPrice: Decimal;
  /** P&L realizado acumulado de la posición. */
  realizedPnl: Decimal;
  closed: boolean;
};

export type MarketOrderRejected = { status: 'rejected'; reason: RejectReason };

export type MarketOrderFilled = {
  status: 'filled';
  /** `ask` en compras, `bid` en ventas. */
  price: Decimal;
  /** `cantidad × precio`, en centavos. */
  notional: Decimal;
  /** Asiento contable: negativo en compras, positivo en ventas. */
  ledgerAmount: Decimal;
  balanceAfter: Decimal;
  /** P&L realizado por esta ejecución. Cero en compras. */
  realizedPnl: Decimal;
  position: PositionAfter;
};

export type MarketOrderResult = MarketOrderRejected | MarketOrderFilled;

function reject(reason: RejectReason): MarketOrderRejected {
  return { status: 'rejected', reason };
}

/**
 * Ejecuta una orden market contra el último tick. Función pura: no lee reloj, red ni base.
 * V0: solo largos, 1:1, sin comisiones. Una venta solo reduce o cierra una posición larga.
 */
export function executeMarketOrder(input: MarketOrderInput): MarketOrderResult {
  const { now, window, instrument, tick, side } = input;

  if (!instrument.tradable) return reject('market_closed');
  if (now < window.startsAt || now >= window.endsAt) return reject('market_closed');

  if (!tick) return reject('no_price');
  const bid = dec(tick.bid);
  const ask = dec(tick.ask);
  if (!bid.isFinite() || !ask.isFinite() || bid.lte(0) || ask.lt(bid)) return reject('no_price');
  if (now - tick.ts > input.staleAfterMs) return reject('stale_price');

  const quantity = dec(input.quantity);
  if (
    !quantity.isFinite() ||
    quantity.lte(0) ||
    quantity.decimalPlaces() > instrument.quantityPrecision ||
    quantity.lt(dec(instrument.minQuantity))
  ) {
    return reject('invalid_quantity');
  }

  const balance = dec(input.balance);
  const held = input.position ? dec(input.position.quantity) : ZERO;
  const costBasis = input.position ? dec(input.position.costBasis) : ZERO;
  const accumulatedPnl = input.position ? dec(input.position.realizedPnl) : ZERO;

  if (side === 'buy') {
    const notional = roundMoney(quantity.times(ask));
    if (notional.gt(balance)) return reject('insufficient_funds');

    const newQuantity = held.plus(quantity);
    const newCostBasis = costBasis.plus(notional);
    return {
      status: 'filled',
      price: ask,
      notional,
      ledgerAmount: notional.negated(),
      balanceAfter: balance.minus(notional),
      realizedPnl: ZERO,
      position: {
        quantity: newQuantity,
        costBasis: newCostBasis,
        avgEntryPrice: roundPrice(newCostBasis.div(newQuantity)),
        realizedPnl: accumulatedPnl,
        closed: false,
      },
    };
  }

  if (held.lte(0) || quantity.gt(held)) return reject('insufficient_position');

  const notional = roundMoney(quantity.times(bid));
  const closes = quantity.eq(held);
  // Al cerrar se libera todo el costo: así no queda un residuo de centavos en la posición.
  const releasedCost = closes ? costBasis : roundMoney(costBasis.times(quantity).div(held));
  const realizedPnl = notional.minus(releasedCost);

  return {
    status: 'filled',
    price: bid,
    notional,
    ledgerAmount: notional,
    balanceAfter: balance.plus(notional),
    realizedPnl,
    position: {
      quantity: held.minus(quantity),
      costBasis: costBasis.minus(releasedCost),
      // El precio promedio no cambia al vender.
      avgEntryPrice: roundPrice(costBasis.div(held)),
      realizedPnl: accumulatedPnl.plus(realizedPnl),
      closed: closes,
    },
  };
}
