import { LOGIN_ROUTE, TERMINAL_ROUTE, type Route } from '../../lib/router.js';
import type { SessionStatus } from '../../stores/session-store.js';

/**
 * A dónde llevar a cada quien, o `null` si se queda donde está:
 * - sin sesión (un 401 del servidor) y sin haber elegido entrar como invitado → `/ingreso`;
 * - con sesión en `/ingreso` → la terminal;
 * - con la sesión en `checking` o `unknown`, nadie se mueve (ajuste 1 del Gerente: sin red no es
 *   "sin sesión").
 */
export function redirectFor(status: SessionStatus, guest: boolean, route: Route): string | null {
  if (status === 'anonymous' && !guest && route === 'terminal') return LOGIN_ROUTE;
  if (status === 'authenticated' && route === 'login') return TERMINAL_ROUTE;
  return null;
}
