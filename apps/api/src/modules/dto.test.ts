import { orderRejectReasonSchema } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { toPublicRejectReason } from './dto.js';

describe('toPublicRejectReason', () => {
  it('below_minimum sale tal cual (contrato v2); stale_price sale como no_price hasta T7', () => {
    expect(toPublicRejectReason('below_minimum')).toBe('below_minimum');
    expect(toPublicRejectReason('stale_price')).toBe('no_price');
  });

  it('todo motivo de la base sale como un motivo válido del contrato', () => {
    const dbReasons = [
      'insufficient_funds',
      'insufficient_position',
      'invalid_quantity',
      'below_minimum',
      'no_price',
      'market_closed',
      'stale_price',
    ] as const;
    for (const reason of dbReasons) {
      expect(orderRejectReasonSchema.safeParse(toPublicRejectReason(reason)).success).toBe(true);
    }
  });
});
