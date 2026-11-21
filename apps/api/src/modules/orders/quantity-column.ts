import type { PlaceOrderRequest } from '@coin/shared';
import type { Db } from '../../db/prisma.js';
import { dec, type Decimal } from '../../engine/index.js';

/** `orders.quantity` es `DECIMAL(28,8)`: 20 dígitos enteros y 8 decimales como máximo. */
const MAX_DECIMALS = 8;
const LIMIT = dec('1e20');

/**
 * `true` si la cantidad se puede guardar en `orders.quantity`. Una que no cabe no se puede guardar
 * ni como orden rechazada: la base la redondearía a 0 o se desbordaría (DEF-003).
 */
export function fitsQuantityColumn(quantity: Decimal): boolean {
  return quantity.decimalPlaces() <= MAX_DECIMALS && quantity.abs().lt(LIMIT);
}

/**
 * Deja en `audit_logs` una orden rechazada sin guardar porque su cantidad no cabe en la columna.
 * Es evidencia de la conducta 5 del reglamento ("cantidades inválidas"), decidido por el Gerente
 * el 2026-11-21. No hay orden: la entidad es la petición, identificada por su `clientOrderId`.
 */
export async function recordRefusedOrder(
  db: Db,
  input: { accountId: string; userId: string; request: PlaceOrderRequest; now: number },
): Promise<void> {
  const { accountId, userId, request, now } = input;
  await db.auditLog.create({
    data: {
      accountId,
      actor: userId,
      action: 'order.refused',
      entityType: 'order_request',
      entityId: request.clientOrderId,
      payload: {
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        // Tal como llegó en el JSON (por ejemplo `1e-30`), para reconstruir el intento.
        quantity: String(request.quantity),
        reason: 'invalid_quantity',
        createdAt: now,
      },
      createdAt: new Date(now),
    },
  });
}
