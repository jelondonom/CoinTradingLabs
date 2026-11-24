import type { MessageKey } from '../../i18n/index.js';
import type { SessionStatus } from '../../stores/session-store.js';

/** Estado del ticket en `data-state` (`docs/qa/data-testid.md`). `ready` llega con la tarea F6. */
export type TicketStatus = 'ready' | 'offline' | 'no-session' | 'stale' | 'engine-off';

/** Estados en los que el ticket no deja operar. */
export type TicketBlockedStatus = Exclude<TicketStatus, 'ready'>;

/**
 * Por qué el ticket no deja operar, en el orden en que se revisa: la conexión, la sesión, el precio
 * y, mientras el motor no reciba órdenes desde la web, `engine-off`. `no-session` es solo para
 * `anonymous`: si la sesión no se pudo comprobar (`unknown`), la cookie puede seguir vigente y no
 * se le pide a nadie que vuelva a ingresar.
 */
export function ticketStatus({
  live,
  stale,
  session,
}: {
  live: boolean;
  stale: boolean;
  session: SessionStatus;
}): TicketBlockedStatus {
  if (!live) return 'offline';
  if (session === 'anonymous') return 'no-session';
  if (stale) return 'stale';
  return 'engine-off';
}

/** Texto de cada estado en `i18n`. */
export const TICKET_STATUS_MESSAGE: Record<TicketBlockedStatus, MessageKey> = {
  offline: 'ticket.offline',
  'no-session': 'ticket.noSession',
  stale: 'ticket.stale',
  'engine-off': 'ticket.engineOff',
};
