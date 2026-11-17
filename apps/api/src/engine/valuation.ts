import { ZERO, dec, roundMoney, type Decimal, type DecimalInput } from './decimal.js';

/** Valor de mercado de una posición larga: se valora al `bid`, el precio al que se vendería. */
export function marketValue(quantity: DecimalInput, bid: DecimalInput): Decimal {
  return roundMoney(dec(quantity).times(dec(bid)));
}

/** P&L no realizado: valor de mercado menos el dinero pagado por la cantidad abierta. */
export function unrealizedPnl(
  position: { quantity: DecimalInput; costBasis: DecimalInput },
  bid: DecimalInput,
): Decimal {
  return marketValue(position.quantity, bid).minus(dec(position.costBasis));
}

/** Equity: efectivo más el valor de mercado de las posiciones abiertas. */
export function equity(
  balance: DecimalInput,
  positions: readonly { quantity: DecimalInput; bid: DecimalInput }[],
): Decimal {
  return positions.reduce(
    (total, position) => total.plus(marketValue(position.quantity, position.bid)),
    dec(balance).plus(ZERO),
  );
}

/** Retorno del ranking como fracción con 6 decimales (0.05 = 5 %). */
export function returnPct(equityValue: DecimalInput, initialBalance: DecimalInput): Decimal {
  const initial = dec(initialBalance);
  if (initial.lte(0)) throw new RangeError('El saldo inicial debe ser mayor que cero.');
  return dec(equityValue).minus(initial).div(initial).toDecimalPlaces(6);
}
