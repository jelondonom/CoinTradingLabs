import type { MessageKey } from '../../i18n/index.js';

/** Estado del ticket en `data-state` (`docs/qa/data-testid.md`). `ready` llega con la tarea F6. */
export type TicketStatus = 'ready' | 'offline' | 'stale' | 'engine-off';

/** Estados en los que el ticket no deja operar. */
export type TicketBlockedStatus = Exclude<TicketStatus, 'ready'>;

/**
 * Por qué el ticket no deja operar, en el orden en que se revisa: primero la conexión, después el
 * precio. Mientras el motor no reciba órdenes desde la web, el resto es `engine-off`.
 */
export function ticketStatus({
  live,
  stale,
}: {
  live: boolean;
  stale: boolean;
}): TicketBlockedStatus {
  if (!live) return 'offline';
  if (stale) return 'stale';
  return 'engine-off';
}

/** Texto de cada estado en `i18n`. */
export const TICKET_STATUS_MESSAGE: Record<TicketBlockedStatus, MessageKey> = {
  offline: 'ticket.offline',
  stale: 'ticket.stale',
  'engine-off': 'ticket.engineOff',
};
