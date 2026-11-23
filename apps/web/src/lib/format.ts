const LOCALE = 'es-CO';
const decimalFormatters = new Map<number, Intl.NumberFormat>();

function decimalFormatter(decimals: number): Intl.NumberFormat {
  let formatter = decimalFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: 'always',
    });
    decimalFormatters.set(decimals, formatter);
  }
  return formatter;
}

/** Precio con los decimales del instrumento. Sin dato devuelve una raya. */
export function formatPrice(value: number | undefined, decimals: number): string {
  return value === undefined ? '—' : decimalFormatter(decimals).format(value);
}

/** Moneda de la plataforma (`currency: 'USD'` en el contrato). */
export const CURRENCY = 'USD';

/** Espacio que no se parte: la moneda nunca queda sola en otra línea. */
const NO_BREAK_SPACE = ' ';

/**
 * Monto en dólares, siempre con la moneda escrita: `100.000,00 USD`. En Colombia "$" se lee como
 * pesos, así que nunca se usa solo. Es la única función que convierte números en dinero: saldo,
 * ticket, posiciones y errores salen de aquí.
 */
export function formatMoney(value: number, decimals: 0 | 2 = 2): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}${decimalFormatter(decimals).format(Math.abs(value))}${NO_BREAK_SPACE}${CURRENCY}`;
}

export function formatQuantity(value: number, decimals: number): string {
  return decimalFormatter(decimals).format(value);
}
