import { describe, expect, it } from 'vitest';
import { t } from '../../i18n/index.js';
import { TICKET_STATUS_MESSAGE, ticketStatus } from './ticket-status.js';

describe('ticketStatus', () => {
  it('sin conexión es offline, aunque el precio también esté obsoleto', () => {
    expect(ticketStatus({ live: false, stale: false })).toBe('offline');
    expect(ticketStatus({ live: false, stale: true })).toBe('offline');
  });

  it('con conexión y precio obsoleto es stale', () => {
    expect(ticketStatus({ live: true, stale: true })).toBe('stale');
  });

  it('con conexión y precio vigente espera al motor: engine-off', () => {
    expect(ticketStatus({ live: true, stale: false })).toBe('engine-off');
  });

  it('cada estado tiene su texto en i18n', () => {
    for (const key of Object.values(TICKET_STATUS_MESSAGE)) {
      expect(t(key, { symbol: 'BTCUSD' })).not.toBe('');
    }
  });
});
