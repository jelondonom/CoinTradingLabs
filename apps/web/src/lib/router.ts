import { useSyncExternalStore } from 'react';

/** Ruta de la pantalla de ingreso (A2: ninguna pantalla empieza por `/api/`, `/market/` ni `/ws/`). */
export const LOGIN_ROUTE = '/ingreso';
export const TERMINAL_ROUTE = '/';

export type Route = 'login' | 'terminal';

/** La pantalla de cada ruta. Cualquier ruta que no sea `/ingreso` muestra la terminal. */
export function routeFor(pathname: string): Route {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return path === LOGIN_ROUTE ? 'login' : 'terminal';
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('popstate', onChange);
  };
}

const currentPath = () => window.location.pathname;
const serverPath = () => TERMINAL_ROUTE;

/**
 * Cambia de ruta sin recargar la página. Caddy y Vite devuelven `index.html` en cualquier ruta
 * (A2), así que recargar en `/ingreso` también funciona.
 */
export function navigate(path: string, { replace = false }: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined' || window.location.pathname === path) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  for (const listener of listeners) listener();
}

/** Ruta actual. Cambia con `navigate` y con los botones atrás y adelante del navegador. */
export function useRoute(): Route {
  return routeFor(useSyncExternalStore(subscribe, currentPath, serverPath));
}
