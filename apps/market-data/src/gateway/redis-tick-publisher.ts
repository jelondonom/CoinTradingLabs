import type { InstrumentSymbol, Tick } from '@coin/shared';

/** Llave con el último tick de un símbolo. La lee el motor de trading (`apps/api`). */
export function lastTickKey(symbol: InstrumentSymbol): string {
  return `last:${symbol}`;
}

/** Canal de pub/sub por el que sale cada tick de un símbolo. */
export function tickChannel(symbol: InstrumentSymbol): string {
  return `ticks:${symbol}`;
}

/** Lo mínimo que este módulo necesita de un cliente de Redis. */
export type RedisWriter = {
  set(key: string, value: string): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
};

export type RedisTickPublisherOptions = {
  /** Se llama una vez cuando Redis empieza a fallar, no por cada tick perdido. */
  onFailure?: (error: unknown) => void;
  /** Se llama una vez cuando Redis vuelve a aceptar escrituras. */
  onRecovery?: () => void;
};

/**
 * Publica cada tick en Redis: `SET last:{symbol}` sin vencimiento y `PUBLISH ticks:{symbol}`,
 * ambos con el tick del contrato en JSON. El motor decide si un precio es viejo comparando `ts`
 * con su reloj y usa el último tick conocido para valorar posiciones, por eso la llave no expira.
 *
 * Si Redis falla, el tick se pierde para Redis pero el servicio sigue: nunca lanza.
 */
export class RedisTickPublisher {
  private failing = false;

  constructor(
    private readonly redis: RedisWriter,
    private readonly options: RedisTickPublisherOptions = {},
  ) {}

  /** `true` si la última escritura falló. */
  get isFailing(): boolean {
    return this.failing;
  }

  async publish(tick: Tick): Promise<void> {
    const payload = JSON.stringify(tick);
    try {
      await Promise.all([
        this.redis.set(lastTickKey(tick.symbol), payload),
        this.redis.publish(tickChannel(tick.symbol), payload),
      ]);
      if (this.failing) {
        this.failing = false;
        this.options.onRecovery?.();
      }
    } catch (error) {
      if (!this.failing) {
        this.failing = true;
        this.options.onFailure?.(error);
      }
    }
  }
}
