import { describe, expect, it } from 'vitest';
import { t } from '../../i18n/index.js';
import { TICKET_STATUS_MESSAGE, ticketStatus } from './ticket-status.js';

const withSession = { session: 'authenticated' as const };

describe('ticketStatus', () => {
  it('sin conexión es offline, aunque falte la sesión o el precio esté obsoleto', () => {
    expect(ticketStatus({ live: false, stale: false, ...withSession })).toBe('offline');
    expect(ticketStatus({ live: false, stale: true, session: 'anonymous' })).toBe('offline');
  });

  it('con conexión y sin sesión es no-session, antes que el precio obsoleto', () => {
    expect(ticketStatus({ live: true, stale: false, session: 'anonymous' })).toBe('no-session');
    expect(ticketStatus({ live: true, stale: true, session: 'anonymous' })).toBe('no-session');
  });

  it('si la sesión no se pudo comprobar (unknown) o se está comprobando, no pide ingresar', () => {
    expect(ticketStatus({ live: true, stale: false, session: 'unknown' })).toBe('engine-off');
    expect(ticketStatus({ live: true, stale: false, session: 'checking' })).toBe('engine-off');
  });

  it('con conexión, sesión y precio obsoleto es stale', () => {
    expect(ticketStatus({ live: true, stale: true, ...withSession })).toBe('stale');
  });

  it('con conexión, sesión y precio vigente espera al motor: engine-off', () => {
    expect(ticketStatus({ live: true, stale: false, ...withSession })).toBe('engine-off');
  });

  it('cada estado tiene su texto en i18n', () => {
    for (const key of Object.values(TICKET_STATUS_MESSAGE)) {
      expect(t(key, { symbol: 'BTCUSD' })).not.toBe('');
    }
  });
});
