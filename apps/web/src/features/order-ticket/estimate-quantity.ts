/**
 * Cantidad aproximada que se recibiría por `amount` dólares al precio `price`, redondeada hacia
 * abajo a los decimales del instrumento. Es solo informativa: la cantidad y el precio reales los
 * fija el servidor al ejecutar la orden.
 */
export function estimateQuantity(amount: number, price: number | undefined, precision: number) {
  if (price === undefined || !(amount > 0) || !(price > 0)) return null;
  const factor = 10 ** precision;
  const quantity = Math.floor((amount / price) * factor + 1e-9) / factor;
  return quantity > 0 ? quantity : null;
}
