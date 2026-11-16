import type { Tick } from '@coin/shared';

/** Estado de la conexión con la fuente de precios. */
export type FeedStatus = 'connected' | 'disconnected';

export type FeedHandlers = {
  /** Recibe cada tick ya normalizado al contrato común. */
  onTick: (tick: Tick) => void;
  /** Avisa cada vez que la fuente se conecta o se cae. */
  onStatus: (status: FeedStatus) => void;
};

/**
 * Fuente de precios intercambiable. Hay una sola instancia por proveedor y el servidor reparte:
 * los clientes nunca se conectan directo a la fuente.
 */
export interface FeedAdapter {
  /** Nombre corto para logs y `/health`: `mock`, `binance`, `replay`. */
  readonly name: string;
  /** `true` si los precios NO son reales. */
  readonly simulated: boolean;
  /** Empieza a entregar ticks. Llamarlo dos veces sin `stop` es un error. */
  start(handlers: FeedHandlers): Promise<void>;
  /** Deja de entregar ticks y libera recursos. Es seguro llamarlo más de una vez. */
  stop(): Promise<void>;
}
