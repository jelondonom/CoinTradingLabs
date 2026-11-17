import { symbolSchema, type Account, type Position } from '@coin/shared';
import { dec, marketValue, type Decimal } from '../../engine/index.js';
import { notFound } from '../../errors/app-error.js';
import type { TradingDeps } from '../deps.js';
import { toNumber, toPositionDto } from '../dto.js';

export type AccountView = { account: Account; positions: Position[] };

/**
 * Estado de la cuenta con sus posiciones abiertas valoradas al `bid` del último tick.
 * Una posición sin ningún tick se valora a su precio promedio de entrada (P&L cero).
 */
export async function getAccountView(
  deps: Pick<TradingDeps, 'db' | 'ticks'>,
  accountId: string,
): Promise<AccountView> {
  const account = await deps.db.account.findUnique({
    where: { id: accountId },
    include: { positions: { where: { closedAt: null }, orderBy: { openedAt: 'asc' } } },
  });
  if (!account) throw notFound('La cuenta no existe.');

  let equity: Decimal = dec(account.balance.toString());
  const positions: Position[] = [];
  for (const row of account.positions) {
    const tick = await deps.ticks.getLastTick(symbolSchema.parse(row.symbol));
    const bid = tick ? dec(tick.bid) : null;
    const marketPrice = bid?.gt(0) ? bid : dec(row.avgEntryPrice.toString());
    const value = marketValue(row.quantity.toString(), marketPrice);
    equity = equity.plus(value);
    positions.push(
      toPositionDto(row, {
        marketPrice,
        unrealizedPnl: value.minus(dec(row.costBasis.toString())),
      }),
    );
  }

  return {
    account: {
      id: account.id,
      currency: 'USD',
      initialBalance: toNumber(account.initialBalance),
      balance: toNumber(account.balance),
      equity: toNumber(equity),
      leverage: 1,
      createdAt: account.createdAt.getTime(),
      updatedAt: account.updatedAt.getTime(),
    },
    positions,
  };
}
