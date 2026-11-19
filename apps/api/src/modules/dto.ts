import {
  orderSchema,
  symbolSchema,
  type Order,
  type OrderRejectReason,
  type Position,
} from '@coin/shared';
import type { Decimal } from '../engine/index.js';
import type {
  Order as OrderRow,
  OrderRejectReason as DbRejectReason,
  Position as PositionRow,
} from '../generated/prisma/client.js';

/**
 * Único punto donde un decimal se convierte en `number`: el borde de la API (ADR-0002).
 * Hacia adentro todo es decimal exacto.
 */
export function toNumber(value: { toString(): string }): number {
  return Number(value.toString());
}

/**
 * TEMPORAL: el contrato v1 no tiene `stale_price` ni `below_minimum`, así que hacia afuera se
 * informan como `no_price` e `invalid_quantity`. La base guarda el motivo real. Se elimina con
 * el contrato v2 (solicitudes 1 y 10 de `docs/engine-rules.md`).
 */
export function toPublicRejectReason(reason: DbRejectReason): OrderRejectReason {
  if (reason === 'stale_price') return 'no_price';
  if (reason === 'below_minimum') return 'invalid_quantity';
  return reason;
}

export function toOrderDto(row: OrderRow): Order {
  return orderSchema.parse({
    id: row.id,
    accountId: row.accountId,
    clientOrderId: row.clientOrderId,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    quantity: toNumber(row.quantity),
    status: row.status,
    filledPrice: row.filledPrice ? toNumber(row.filledPrice) : null,
    rejectReason: row.rejectReason ? toPublicRejectReason(row.rejectReason) : null,
    createdAt: row.createdAt.getTime(),
    filledAt: row.filledAt ? row.filledAt.getTime() : null,
  });
}

export function toPositionDto(
  row: PositionRow,
  valuation: { marketPrice: Decimal; unrealizedPnl: Decimal },
): Position {
  return {
    id: row.id,
    accountId: row.accountId,
    symbol: symbolSchema.parse(row.symbol),
    side: row.side,
    quantity: toNumber(row.quantity),
    avgEntryPrice: toNumber(row.avgEntryPrice),
    marketPrice: toNumber(valuation.marketPrice),
    unrealizedPnl: toNumber(valuation.unrealizedPnl),
    realizedPnl: toNumber(row.realizedPnl),
    openedAt: row.openedAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
