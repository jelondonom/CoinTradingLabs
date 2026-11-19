import { Decimal } from 'decimal.js';

/**
 * Constructor decimal del motor. 40 dígitos significativos: ninguna operación intermedia
 * (cantidad × precio, costo × q / Q) pierde precisión antes del redondeo final.
 */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type DecimalInput = Decimal | string | number;

/** Convierte a un decimal del motor. Un `number` se lee por su representación decimal. */
export function dec(value: DecimalInput): Decimal {
  return new Dec(typeof value === 'number' ? String(value) : value);
}

export const ZERO: Decimal = dec(0);

/** Redondea un monto a centavos, la mitad hacia arriba. */
export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Redondea un monto a centavos hacia arriba. Lo que paga el participante (compra, D-01). */
export function roundMoneyUp(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_CEIL);
}

/** Redondea un monto a centavos hacia abajo. Lo que recibe el participante (venta, D-01). */
export function roundMoneyDown(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_FLOOR);
}

/** Redondea un precio a 8 decimales, la escala con la que se guarda. */
export function roundPrice(value: Decimal): Decimal {
  return value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
}

export type { Decimal };
