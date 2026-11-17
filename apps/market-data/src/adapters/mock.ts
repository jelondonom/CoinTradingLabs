import { SYMBOLS, type InstrumentSymbol } from '@coin/shared';
import { PriceSimulator } from '../price-simulator.js';
import type { FeedAdapter, FeedHandlers } from './feed-adapter.js';

export type MockFeedOptions = {
  /** Cada cuánto se emite un tick por símbolo, en milisegundos. */
  intervalMs: number;
  symbols?: readonly InstrumentSymbol[];
  /** Semilla para que la secuencia de precios sea reproducible. Sin semilla usa `Math.random`. */
  seed?: number;
  /** Reloj inyectable para tests. */
  now?: () => number;
};

/** Generador pseudoaleatorio determinista (mulberry32). Devuelve valores en [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Feed simulado: caminata aleatoria, sin internet. NO son precios reales.
 * Sirve para desarrollo, pruebas y contingencia.
 */
export class MockFeedAdapter implements FeedAdapter {
  readonly name = 'mock';
  readonly simulated = true;

  private readonly simulator: PriceSimulator;
  private readonly symbols: readonly InstrumentSymbol[];
  private readonly now: () => number;
  private handlers: FeedHandlers | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: MockFeedOptions) {
    this.symbols = options.symbols ?? SYMBOLS;
    this.now = options.now ?? Date.now;
    this.simulator = new PriceSimulator(
      options.seed === undefined ? Math.random : seededRandom(options.seed),
    );
  }

  start(handlers: FeedHandlers): Promise<void> {
    if (this.handlers) return Promise.reject(new Error('El feed mock ya está iniciado.'));
    this.handlers = handlers;
    handlers.onStatus('connected');
    this.emit();
    this.timer = setInterval(() => this.emit(), this.options.intervalMs);
    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (!this.handlers) return Promise.resolve();
    clearInterval(this.timer);
    this.timer = undefined;
    const { onStatus } = this.handlers;
    this.handlers = undefined;
    onStatus('disconnected');
    return Promise.resolve();
  }

  private emit(): void {
    const ts = this.now();
    for (const symbol of this.symbols) {
      this.handlers?.onTick(this.simulator.next(symbol, ts));
    }
  }
}
