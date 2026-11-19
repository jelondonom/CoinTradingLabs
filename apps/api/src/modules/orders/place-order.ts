import type { PlaceOrderRequest } from '@coin/shared';
import { isUniqueViolation, type Tx } from '../../db/prisma.js';
import { dec, executeMarketOrder, type EngineTick } from '../../engine/index.js';
import { invalidRequest, notFound } from '../../errors/app-error.js';
import type { Order as OrderRow } from '../../generated/prisma/client.js';
import type { TradingDeps } from '../deps.js';

export type PlaceOrderResult = {
  order: OrderRow;
  /** `true` si el `clientOrderId` ya existía: se devuelve la orden original sin ejecutar. */
  replayed: boolean;
};

type OrderDeps = Pick<TradingDeps, 'db' | 'ticks' | 'queue' | 'now' | 'staleAfterMs'>;

/** Texto exacto de un decimal para guardarlo en una columna NUMERIC. */
function text(value: { toFixed(): string }): string {
  return value.toFixed();
}

/**
 * Ejecuta una orden market para la cuenta. El cliente solo aporta símbolo, lado, cantidad y
 * `clientOrderId`: el precio sale del último tick del servidor.
 *
 * Orden, fill, posición, asiento contable, saldo y auditoría se escriben en una sola
 * transacción: o queda todo, o no queda nada.
 */
export function placeOrder(
  deps: OrderDeps,
  accountId: string,
  request: PlaceOrderRequest,
): Promise<PlaceOrderResult> {
  return deps.queue.run(accountId, async () => {
    const clientOrderId = request.clientOrderId ?? null;

    const findReplay = async (): Promise<OrderRow | null> =>
      clientOrderId
        ? deps.db.order.findUnique({
            where: { accountId_clientOrderId: { accountId, clientOrderId } },
          })
        : null;

    const existing = await findReplay();
    if (existing) return { order: existing, replayed: true };

    const tick = await deps.ticks.getLastTick(request.symbol);
    const now = deps.now();

    try {
      const order = await deps.db.$transaction((tx) =>
        executeInTransaction(tx, { accountId, request, tick, now }, deps.staleAfterMs),
      );
      return { order, replayed: false };
    } catch (error) {
      // Otro proceso guardó la misma orden entre la consulta y la escritura.
      if (isUniqueViolation(error)) {
        const replay = await findReplay();
        if (replay) return { order: replay, replayed: true };
      }
      throw error;
    }
  });
}

async function executeInTransaction(
  tx: Tx,
  input: { accountId: string; request: PlaceOrderRequest; tick: EngineTick | null; now: number },
  staleAfterMs: number,
): Promise<OrderRow> {
  const { accountId, request, tick, now } = input;
  const at = new Date(now);

  // Bloquea la fila de la cuenta: ninguna otra transacción la lee ni la cambia hasta terminar.
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE`;
  if (locked.length === 0) throw notFound('La cuenta no existe.');

  const account = await tx.account.findUniqueOrThrow({
    where: { id: accountId },
    include: { competition: true },
  });
  const instrument = await tx.instrument.findUnique({ where: { symbol: request.symbol } });
  if (!instrument) throw new Error(`El instrumento ${request.symbol} no está en el catálogo.`);
  const position = await tx.position.findFirst({
    where: { accountId, symbol: request.symbol, closedAt: null },
  });

  // TEMPORAL (contrato v2, PR del Arquitecto): la orden por monto (D-09) la implementa el Backend.
  if (request.quantity === undefined) {
    throw invalidRequest('La orden por monto todavía no está disponible.');
  }
  const quantity = dec(request.quantity);
  const result = executeMarketOrder({
    now,
    window: {
      startsAt: account.competition.startsAt.getTime(),
      endsAt: account.competition.endsAt.getTime(),
    },
    instrument: {
      tradable: instrument.tradable,
      quantityPrecision: instrument.quantityPrecision,
      minQuantity: instrument.minQuantity.toString(),
    },
    tick,
    staleAfterMs,
    balance: account.balance.toString(),
    position: position && {
      quantity: position.quantity.toString(),
      costBasis: position.costBasis.toString(),
      realizedPnl: position.realizedPnl.toString(),
    },
    side: request.side,
    quantity,
  });

  const orderBase = {
    accountId,
    clientOrderId: request.clientOrderId ?? null,
    symbol: request.symbol,
    side: request.side,
    type: request.type,
    quantity: text(quantity),
    createdAt: at,
  };
  const tickAudit = tick && { bid: text(dec(tick.bid)), ask: text(dec(tick.ask)), ts: tick.ts };

  if (result.status === 'rejected') {
    const order = await tx.order.create({
      data: { ...orderBase, status: 'rejected', rejectReason: result.reason },
    });
    await tx.auditLog.create({
      data: {
        accountId,
        actor: account.userId,
        action: 'order.rejected',
        entityType: 'order',
        entityId: order.id,
        payload: { ...orderBase, createdAt: now, reason: result.reason, tick: tickAudit },
        createdAt: at,
      },
    });
    return order;
  }

  // Si el motor ejecutó, había tick.
  if (!tick) throw new Error('Ejecución sin tick.');

  const order = await tx.order.create({
    data: { ...orderBase, status: 'filled', filledPrice: text(result.price), filledAt: at },
  });

  const positionData = {
    quantity: text(result.position.quantity),
    costBasis: text(result.position.costBasis),
    avgEntryPrice: text(result.position.avgEntryPrice),
    realizedPnl: text(result.position.realizedPnl),
    closedAt: result.position.closed ? at : null,
  };
  const savedPosition = position
    ? await tx.position.update({ where: { id: position.id }, data: positionData })
    : await tx.position.create({
        data: { ...positionData, accountId, symbol: request.symbol, side: 'long', openedAt: at },
      });

  const fill = await tx.fill.create({
    data: {
      orderId: order.id,
      accountId,
      positionId: savedPosition.id,
      symbol: request.symbol,
      side: request.side,
      quantity: text(quantity),
      price: text(result.price),
      notional: text(result.notional),
      realizedPnl: text(result.realizedPnl),
      tickBid: text(dec(tick.bid)),
      tickAsk: text(dec(tick.ask)),
      tickTs: new Date(tick.ts),
      createdAt: at,
    },
  });

  await tx.ledgerEntry.create({
    data: {
      accountId,
      type: request.side === 'buy' ? 'trade_buy' : 'trade_sell',
      amount: text(result.ledgerAmount),
      balanceAfter: text(result.balanceAfter),
      fillId: fill.id,
      createdAt: at,
    },
  });
  await tx.account.update({
    where: { id: accountId },
    data: { balance: text(result.balanceAfter) },
  });

  await tx.auditLog.create({
    data: {
      accountId,
      actor: account.userId,
      action: 'order.filled',
      entityType: 'order',
      entityId: order.id,
      payload: {
        ...orderBase,
        createdAt: now,
        fillId: fill.id,
        positionId: savedPosition.id,
        price: text(result.price),
        notional: text(result.notional),
        realizedPnl: text(result.realizedPnl),
        balanceBefore: text(dec(account.balance.toString())),
        balanceAfter: text(result.balanceAfter),
        tick: tickAudit,
      },
      createdAt: at,
    },
  });

  return order;
}
