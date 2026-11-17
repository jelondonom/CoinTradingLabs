import { tickSchema, type InstrumentSymbol } from '@coin/shared';
import type { EngineTick } from '../../engine/index.js';

/** De dónde lee el motor el último precio. El motor nunca acepta precios del cliente. */
export interface TickSource {
  /** Último tick del símbolo, o `null` si no hay ninguno. */
  getLastTick(symbol: InstrumentSymbol): Promise<EngineTick | null>;
}

/** Llave de Redis con el último tick. Propuesta al Agente Datos de Mercado. */
export function lastTickKey(symbol: InstrumentSymbol): string {
  return `last:${symbol}`;
}

/** Lo mínimo que este módulo necesita de un cliente de Redis. */
export type RedisReader = { get(key: string): Promise<string | null> };

/** Convierte el JSON guardado en Redis en un tick del motor. `null` si no cumple el contrato. */
export function parseTick(raw: string | null, symbol: InstrumentSymbol): EngineTick | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const tick = tickSchema.safeParse(json);
  if (!tick.success || tick.data.symbol !== symbol) return null;
  return { bid: tick.data.bid, ask: tick.data.ask, ts: tick.data.ts };
}

/** Lee `last:{symbol}` de Redis. Si Redis falla, no hay precio: la orden se rechaza. */
export class RedisTickSource implements TickSource {
  constructor(private readonly redis: RedisReader) {}

  async getLastTick(symbol: InstrumentSymbol): Promise<EngineTick | null> {
    try {
      return parseTick(await this.redis.get(lastTickKey(symbol)), symbol);
    } catch {
      return null;
    }
  }
}

/** Fuente en memoria, para tests. */
export class MemoryTickSource implements TickSource {
  private readonly ticks = new Map<InstrumentSymbol, EngineTick>();

  set(symbol: InstrumentSymbol, tick: EngineTick | null): void {
    if (tick) this.ticks.set(symbol, tick);
    else this.ticks.delete(symbol);
  }

  async getLastTick(symbol: InstrumentSymbol): Promise<EngineTick | null> {
    return this.ticks.get(symbol) ?? null;
  }
}
