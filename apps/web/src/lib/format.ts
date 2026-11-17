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

/** Monto en dólares con el signo menos delante del símbolo. */
export function formatMoney(value: number): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}$${decimalFormatter(2).format(Math.abs(value))}`;
}

export function formatQuantity(value: number, decimals: number): string {
  return decimalFormatter(decimals).format(value);
}
