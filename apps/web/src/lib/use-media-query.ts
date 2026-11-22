import { useCallback, useSyncExternalStore } from 'react';

/** Mismo corte que el prefijo `lg:` de Tailwind 4 (64rem): desde ahí la terminal es de escritorio. */
export const DESKTOP_QUERY = '(min-width: 64rem)';

/** Lo mínimo de `MediaQueryList` que se usa. Permite probar con un `matchMedia` falso. */
export type MediaQueryLike = {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
};

export type MatchMediaLike = (query: string) => MediaQueryLike;

const noop = () => undefined;
const serverSnapshot = () => false;

/** `matchMedia` del navegador, o `undefined` en el servidor y en los tests de Node. */
function browserMatchMedia(): MatchMediaLike | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return (query) => window.matchMedia(query);
}

/** `true` si `query` se cumple ahora. Sin `matchMedia`, `false`. */
export function readMediaQuery(matchMedia: MatchMediaLike | undefined, query: string): boolean {
  return matchMedia ? matchMedia(query).matches : false;
}

/** Avisa con `onChange` cada vez que `query` cambia. Devuelve la función que cancela el aviso. */
export function subscribeMediaQuery(
  matchMedia: MatchMediaLike | undefined,
  query: string,
  onChange: () => void,
): () => void {
  if (!matchMedia) return noop;
  const list = matchMedia(query);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/**
 * Sigue una media query. Lee `matchMedia` en el primer render, así la página carga ya con la forma
 * correcta, sin parpadeo. En el servidor y en los tests devuelve `false` (celular).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeMediaQuery(browserMatchMedia(), query, onChange),
    [query],
  );
  const getSnapshot = useCallback(() => readMediaQuery(browserMatchMedia(), query), [query]);
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
