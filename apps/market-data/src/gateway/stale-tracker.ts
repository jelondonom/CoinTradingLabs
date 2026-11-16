import { SYMBOLS, type InstrumentSymbol, type SymbolStatus } from '@coin/shared';

/**
 * Segundos sin actualización a partir de los cuales el precio de un símbolo se considera
 * desactualizado. Binance solo envía un mensaje cuando cambia el bid o el ask, así que un mercado
 * tranquilo calla sin estar caído: por eso el umbral es por símbolo.
 * Valores PROVISIONALES, medidos el 2026-11-16 con la bolsa de EE.UU. cerrada.
 */
const DEFAULT_STALE_AFTER_MS = 30_000;
const STALE_AFTER_MS: Partial<Record<InstrumentSymbol, number>> = {
  EURUSD: 60_000,
  NGASUSD: 60_000,
};

export function staleAfterMs(symbol: InstrumentSymbol): number {
  return STALE_AFTER_MS[symbol] ?? DEFAULT_STALE_AFTER_MS;
}

export type StaleTrackerOptions = {
  onChange: (status: SymbolStatus) => void;
  symbols?: readonly InstrumentSymbol[];
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
    return { symbol, stale: state?.stale ?? true, ts: state?.changedAt ?? this.now() };
  }

  private change(symbol: InstrumentSymbol, state: State, stale: boolean): void {
    state.stale = stale;
    state.changedAt = this.now();
    this.onChange({ symbol, stale, ts: state.changedAt });
  }
}
