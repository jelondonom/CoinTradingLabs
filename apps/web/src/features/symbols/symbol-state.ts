/** Estado de un símbolo en `data-state` (D-05; `docs/qa/data-testid.md`). */
export type SymbolState = 'live' | 'stale' | 'no-price' | 'unavailable';

/**
 * Estado del símbolo con lo que la app sabe hoy. Sin ningún tick no hay precio que mostrar, aunque
 * el servidor no lo marque obsoleto: al suscribirse, market-data no reenvía el último tick.
 * `unavailable` y el caso "sin conexión" llegan con la tarea F8.
 */
export function symbolState({ hasTick, stale }: { hasTick: boolean; stale: boolean }): SymbolState {
  if (!hasTick) return 'no-price';
  return stale ? 'stale' : 'live';
}
