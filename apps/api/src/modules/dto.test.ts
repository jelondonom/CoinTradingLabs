import { orderRejectReasonSchema } from '@coin/shared';
import { describe, expect, it } from 'vitest';
import { toPublicRejectReason } from './dto.js';

describe('toPublicRejectReason (temporal hasta el contrato v2)', () => {
  it('informa stale_price como no_price y below_minimum como invalid_quantity', () => {
    expect(toPublicRejectReason('stale_price')).toBe('no_price');
    expect(toPublicRejectReason('below_minimum')).toBe('invalid_quantity');
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
