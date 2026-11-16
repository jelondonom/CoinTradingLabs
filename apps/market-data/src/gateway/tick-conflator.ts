import type { InstrumentSymbol, Tick } from '@coin/shared';

/**
 * Limita el envío a clientes: guarda solo el último tick de cada símbolo y lo publica a intervalos
 * fijos. Los ticks intermedios se descartan; nunca se inventa ni se repite un precio.
 */
export class TickConflator {
  private readonly pending = new Map<InstrumentSymbol, Tick>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly intervalMs: number,
    private readonly publish: (tick: Tick) => void,
  ) {}

  start(): void {
    this.timer ??= setInterval(() => this.flush(), this.intervalMs);
  }

  push(tick: Tick): void {
    this.pending.set(tick.symbol, tick);
  }

  flush(): void {
    for (const tick of this.pending.values()) this.publish(tick);
    this.pending.clear();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }
}
