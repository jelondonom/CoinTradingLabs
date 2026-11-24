import { ORDER_REJECT_REASONS } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { Prisma, type Order as OrderRow } from '../generated/prisma/client.js';
import { toOrderDto } from './dto.js';

const NOW = 1_800_000_000_000;

function rejectedOrder(rejectReason: OrderRow['rejectReason']): OrderRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    accountId: '00000000-0000-4000-8000-000000000002',
    clientOrderId: '00000000-0000-4000-8000-000000000003',
    symbol: 'BTCUSD',
    side: 'buy',
    type: 'market',
    quantity: new Prisma.Decimal('0.1'),
    status: 'rejected',
    rejectReason,
    filledPrice: null,
    createdAt: new Date(NOW),
    filledAt: null,
  };
}

describe('toOrderDto', () => {
  it('el motivo de rechazo sale tal cual, incluido stale_price (contrato v2)', () => {
    for (const reason of ORDER_REJECT_REASONS) {
      expect(toOrderDto(rejectedOrder(reason)).rejectReason).toBe(reason);
    }
    expect(toOrderDto(rejectedOrder(null)).rejectReason).toBeNull();
  });
});
