import { loginRequestSchema } from '@coin/shared';
import type { ApiFailure } from '../../lib/api/api-client.js';
import type { CoinApi } from '../../lib/api/coin-api.js';
import { api } from '../../lib/api/index.js';
import { LOGIN_ROUTE, TERMINAL_ROUTE, navigate } from '../../lib/router.js';
import { useSessionStore } from '../../stores/session-store.js';

/** Espera entre comprobaciones de la sesión cuando no hay red: crece hasta 30 s, como el WS. */
export const SESSION_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;

export type LoginOutcome =
  | { kind: 'ok' }
  /** El código no cumple el contrato (de 4 a 64 caracteres): no se envía. */
  | { kind: 'too_short' }
  | { kind: 'failed'; failure: ApiFailure };

type SessionStoreView = Pick<
  ReturnType<typeof useSessionStore.getState>,
  'authenticate' | 'setAnonymous' | 'setUnknown' | 'setGuest'
>;

export type SessionDeps = {
  api: Pick<CoinApi, 'getAccount' | 'login' | 'logout'>;
  store: () => SessionStoreView;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  /** Programa `run` dentro de `ms`; devuelve la función que lo cancela. */
  schedule: (run: () => void, ms: number) => () => void;
  /** Avisa cuando el navegador recupera la red; devuelve la función que deja de avisar. */
  onOnline: (run: () => void) => () => void;
};

/** Acciones de la sesión. Las dependencias se inyectan para poder probarlas. */
export function createSessionActions(deps: SessionDeps) {
  let attempt = 0;
  let cancelRetry: (() => void) | null = null;
  let stopOnline: (() => void) | null = null;
  /** Sube con cada ingreso o salida: una comprobación vieja no pisa la sesión nueva. */
  let generation = 0;

  const stopRetrying = () => {
    cancelRetry?.();
    cancelRetry = null;
    stopOnline?.();
    stopOnline = null;
    attempt = 0;
  };

  /**
   * Pregunta al servidor si hay sesión (`GET /api/account`). Solo un 401 la da por cerrada. Sin red
   * o con el servidor caído queda en `unknown` y se reintenta sola, sin mandar a nadie a `/ingreso`.
   */
  async function checkSession(): Promise<void> {
    cancelRetry?.();
    cancelRetry = null;
    const started = generation;
    const result = await deps.api.getAccount();
    if (started !== generation) return;

    if (result.ok) {
      stopRetrying();
      deps.store().authenticate(result.data.account.id);
      return;
    }
    const { failure } = result;
    if (failure.kind === 'aborted') return;
    if ((failure.kind === 'api' || failure.kind === 'http') && failure.status === 401) {
      stopRetrying();
      deps.store().setAnonymous();
      return;
    }

    deps.store().setUnknown();
    const delay =
      SESSION_RETRY_DELAYS_MS[Math.min(attempt, SESSION_RETRY_DELAYS_MS.length - 1)] ?? 30_000;
    attempt += 1;
    cancelRetry = deps.schedule(() => void checkSession(), delay);
    stopOnline ??= deps.onOnline(() => void checkSession());
  }

  async function login(code: string): Promise<LoginOutcome> {
    const parsed = loginRequestSchema.safeParse({ code });
    if (!parsed.success) return { kind: 'too_short' };
    const result = await deps.api.login(parsed.data.code);
    if (!result.ok) return { kind: 'failed', failure: result.failure };
    generation += 1;
    stopRetrying();
    deps.store().authenticate(result.data.accountId);
    deps.navigate(TERMINAL_ROUTE, { replace: true });
    return { kind: 'ok' };
  }

  /** `POST /api/auth/logout`. Con cualquier respuesta, salvo una cancelación, cierra la sesión local. */
  async function logout(): Promise<void> {
    const result = await deps.api.logout();
    if (!result.ok && result.failure.kind === 'aborted') return;
    generation += 1;
    stopRetrying();
    deps.store().setAnonymous();
    deps.store().setGuest(false);
    deps.navigate(LOGIN_ROUTE, { replace: true });
  }

  function enterAsGuest(): void {
    deps.store().setGuest(true);
    deps.navigate(TERMINAL_ROUTE);
  }

  /**
   * Comprueba la sesión al arrancar. La limpieza cancela los reintentos y deja sin efecto una
   * comprobación que siga en vuelo (StrictMode monta los efectos dos veces en desarrollo).
   */
  function start(): () => void {
    void checkSession();
    return () => {
      generation += 1;
      stopRetrying();
    };
  }

  return { checkSession, login, logout, enterAsGuest, start };
}

export const session = createSessionActions({
  api,
  store: useSessionStore.getState,
  navigate,
  schedule: (run, ms) => {
    const id = setTimeout(run, ms);
    return () => clearTimeout(id);
  },
  onOnline: (run) => {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  },
});
