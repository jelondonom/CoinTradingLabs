import type { Candle, CandleInterval, InstrumentSymbol } from '@coin/shared';

const MAX_CANDLES = 1000;

type Listener = (candle: Candle) => void;

/**
 * Guarda las velas en vivo de todos los símbolos para una sola temporalidad.
 * Vive fuera de React: la gráfica se suscribe y actualiza su serie sin re-renderizar.
 */
export class CandleBuffer {
  private readonly bySymbol = new Map<InstrumentSymbol, Candle[]>();
  private readonly listeners = new Set<Listener>();
  private interval: CandleInterval;

  constructor(interval: CandleInterval) {
    this.interval = interval;
  }

  getInterval(): CandleInterval {
    return this.interval;
  }

  /** Cambia la temporalidad y descarta las velas de la anterior. Devuelve si hubo cambio. */
  setInterval(interval: CandleInterval): boolean {
    if (interval === this.interval) return false;
    this.interval = interval;
    this.bySymbol.clear();
    return true;
  }

  /** Agrega o actualiza una vela. Ignora otras temporalidades y velas anteriores a la última. */
  push(candle: Candle): boolean {
    if (candle.interval !== this.interval) return false;
    let list = this.bySymbol.get(candle.symbol);
    if (!list) {
      list = [];
      this.bySymbol.set(candle.symbol, list);
    }
    const last = list.at(-1);
    if (last && candle.openTime < last.openTime) return false;
    if (last && candle.openTime === last.openTime) {
      list[list.length - 1] = candle;
    } else {
      list.push(candle);
      if (list.length > MAX_CANDLES) list.shift();
    }
    for (const listener of this.listeners) listener(candle);
    return true;
  }

  get(symbol: InstrumentSymbol): readonly Candle[] {
    return this.bySymbol.get(symbol) ?? [];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
