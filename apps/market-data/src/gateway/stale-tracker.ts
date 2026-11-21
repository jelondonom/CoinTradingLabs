import { SYMBOLS, staleAfterMs, type InstrumentSymbol, type SymbolStatus } from '@coin/shared';

/**
 * Arma el estado de un símbolo. Único lugar donde se decide `marketOpen` (D-05): todo opera 24/7 y
 * un símbolo está cerrado solo si está deshabilitado o su precio está obsoleto. Hoy market-data no
 * tiene fuente de "deshabilitado", así que solo cuenta el precio obsoleto.
 */
export function symbolStatus(symbol: InstrumentSymbol, stale: boolean, ts: number): SymbolStatus {
  return { symbol, stale, marketOpen: !stale, ts };
}

export type StaleTrackerOptions = {
  onChange: (status: SymbolStatus) => void;
  symbols?: readonly InstrumentSymbol[];
  /** Umbral de precio obsoleto por símbolo. Por defecto, `staleAfterMs` de `@coin/shared` (D-11). */
  thresholdMs?: (symbol: InstrumentSymbol) => number;
  checkIntervalMs?: number;
  now?: () => number;
};

type State = { stale: boolean; changedAt: number; lastTickAt: number | undefined };

/**
 * Lleva el estado de cada símbolo. Un símbolo nace desactualizado (todavía no hay precio), pasa a
 * vigente con su primer tick y vuelve a desactualizado si supera su umbral sin actualizaciones.
 */
export class StaleTracker {
  private readonly states = new Map<InstrumentSymbol, State>();
  private readonly onChange: (status: SymbolStatus) => void;
  private readonly thresholdMs: (symbol: InstrumentSymbol) => number;
  private readonly checkIntervalMs: number;
  private readonly now: () => number;
  private timer: NodeJS.Timeout | undefined;

  constructor(options: StaleTrackerOptions) {
    this.onChange = options.onChange;
    this.thresholdMs = options.thresholdMs ?? staleAfterMs;
    this.checkIntervalMs = options.checkIntervalMs ?? 1_000;
    this.now = options.now ?? Date.now;
    const startedAt = this.now();
    for (const symbol of options.symbols ?? SYMBOLS) {
      this.states.set(symbol, { stale: true, changedAt: startedAt, lastTickAt: undefined });
    }
  }

  start(): void {
    this.timer ??= setInterval(() => this.check(), this.checkIntervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Registra que llegó un precio del proveedor. Usa la hora de recepción, no la del tick. */
  recordTick(symbol: InstrumentSymbol): void {
    const state = this.states.get(symbol);
    if (!state) return;
    state.lastTickAt = this.now();
    if (state.stale) this.change(symbol, state, false);
  }

  check(): void {
    const now = this.now();
    for (const [symbol, state] of this.states) {
      if (state.stale || state.lastTickAt === undefined) continue;
      if (now - state.lastTickAt > this.thresholdMs(symbol)) this.change(symbol, state, true);
    }
  }

  status(symbol: InstrumentSymbol): SymbolStatus {
    const state = this.states.get(symbol);
    const stale = state?.stale ?? true;
    return symbolStatus(symbol, stale, state?.changedAt ?? this.now());
  }

  private change(symbol: InstrumentSymbol, state: State, stale: boolean): void {
    state.stale = stale;
    state.changedAt = this.now();
    this.onChange(symbolStatus(symbol, stale, state.changedAt));
  }
}
