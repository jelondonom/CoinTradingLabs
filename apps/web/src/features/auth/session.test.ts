import type { AccountResponse, LoginResponse } from '@coin/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ApiFailure, ApiResult } from '../../lib/api/api-client.js';
import { LOGIN_ROUTE, TERMINAL_ROUTE } from '../../lib/router.js';
import { SESSION_RETRY_DELAYS_MS, createSessionActions, type SessionDeps } from './session.js';

const ACCOUNT_ID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e';

const ACCOUNT_OK: AccountResponse = {
  account: {
    id: ACCOUNT_ID,
    currency: 'USD',
    initialBalance: 100_000,
    balance: 100_000,
    equity: 100_000,
    leverage: 1,
    createdAt: 1,
    updatedAt: 1,
    realizedPnl: 0,
    unrealizedPnl: 0,
  },
  positions: [],
};
const LOGIN_OK: LoginResponse = { accountId: ACCOUNT_ID, expiresAt: 1_800_000_000_000 };

const ok = <T>(data: T, status = 200): ApiResult<T> => ({ ok: true, status, data });
const fail = (failure: ApiFailure): ApiResult<never> => ({ ok: false, failure });
const UNAUTHORIZED = fail({
  kind: 'api',
  status: 401,
  code: 'unauthorized',
  knownCode: 'unauthorized',
  message: '',
});
const OFFLINE = fail({ kind: 'network', reason: 'offline' });

/** Acciones con un `api` falso, un reloj manual y un evento `online` manual. */
function setup(responses: { getAccount?: ApiResult<AccountResponse>[] } = {}) {
  const accountQueue = [...(responses.getAccount ?? [])];
  const scheduled: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const onlineListeners = new Set<() => void>();
  const store = {
    authenticate: vi.fn(),
    setAnonymous: vi.fn(),
    setUnknown: vi.fn(),
    setGuest: vi.fn(),
  };
  const api = {
    getAccount: vi.fn(async () => accountQueue.shift() ?? OFFLINE),
    login: vi.fn(async (): Promise<ApiResult<LoginResponse>> => ok(LOGIN_OK)),
    logout: vi.fn(async (): Promise<ApiResult<undefined>> => ok(undefined, 204)),
  };
  const navigate = vi.fn();
  const deps: SessionDeps = {
    api,
    store: () => store,
    navigate,
    schedule: (run, ms) => {
      const entry = { run, ms, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    onOnline: (run) => {
      onlineListeners.add(run);
      return () => onlineListeners.delete(run);
    },
  };
  const goOnline = () => {
    for (const listener of [...onlineListeners]) listener();
  };
  return { actions: createSessionActions(deps), api, store, navigate, scheduled, goOnline };
}

/** Deja correr las promesas pendientes. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('checkSession', () => {
  it('un 200 deja la sesión abierta con la cuenta del servidor', async () => {
    const { actions, store, scheduled } = setup({ getAccount: [ok(ACCOUNT_OK)] });
    await actions.checkSession();
    expect(store.authenticate).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(scheduled).toHaveLength(0);
  });

  it('un 401 es sin sesión (ajuste 1: es el único caso)', async () => {
    const { actions, store, scheduled } = setup({ getAccount: [UNAUTHORIZED] });
    await actions.checkSession();
    expect(store.setAnonymous).toHaveBeenCalled();
    expect(store.setUnknown).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);
  });

  it('sin red queda en unknown, no manda a /ingreso y reintenta con espera creciente', async () => {
    const { actions, store, navigate, scheduled } = setup({ getAccount: [OFFLINE, OFFLINE] });
    await actions.checkSession();
    expect(store.setUnknown).toHaveBeenCalled();
    expect(store.setAnonymous).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(scheduled[0]?.ms).toBe(SESSION_RETRY_DELAYS_MS[0]);

    scheduled[0]?.run();
    await flush();
    expect(scheduled[1]?.ms).toBe(SESSION_RETRY_DELAYS_MS[1]);
  });

  it('con el servidor caído (502) también queda en unknown', async () => {
    const { actions, store } = setup({ getAccount: [fail({ kind: 'http', status: 502 })] });
    await actions.checkSession();
    expect(store.setUnknown).toHaveBeenCalled();
    expect(store.setAnonymous).not.toHaveBeenCalled();
  });

  it('al volver la red reintenta de inmediato y un 200 deja de reintentar', async () => {
    const { actions, store, scheduled, goOnline } = setup({
      getAccount: [OFFLINE, ok(ACCOUNT_OK)],
    });
    await actions.checkSession();
    goOnline();
    await flush();
    expect(store.authenticate).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(scheduled[0]?.cancelled).toBe(true);
  });

  it('la espera no pasa de 30 segundos', async () => {
    const offline = Array.from({ length: 8 }, () => OFFLINE);
    const { actions, scheduled } = setup({ getAccount: offline });
    await actions.checkSession();
    for (let i = 0; i < 6; i += 1) {
      scheduled.at(-1)?.run();
      await flush();
    }
    expect(scheduled.at(-1)?.ms).toBe(30_000);
  });
});

describe('login', () => {
  it('con éxito abre la sesión y va a la terminal', async () => {
    const { actions, api, store, navigate } = setup();
    expect(await actions.login('  DEMO1-AAAAA  ')).toEqual({ kind: 'ok' });
    expect(api.login).toHaveBeenCalledWith('DEMO1-AAAAA');
    expect(store.authenticate).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(navigate).toHaveBeenCalledWith(TERMINAL_ROUTE, { replace: true });
  });

  it('un código de menos de 4 caracteres no se envía', async () => {
    const { actions, api } = setup();
    expect(await actions.login(' ab ')).toEqual({ kind: 'too_short' });
    expect(api.login).not.toHaveBeenCalled();
  });

  it('un código inválido (401) o demasiados intentos (429) devuelven la falla', async () => {
    const { actions, api, store, navigate } = setup();
    api.login.mockResolvedValueOnce(UNAUTHORIZED);
    expect(await actions.login('DEMO1-AAAAB')).toEqual({
      kind: 'failed',
      failure: (UNAUTHORIZED as { failure: ApiFailure }).failure,
    });

    const limited = fail({
      kind: 'api',
      status: 429,
      code: 'rate_limited',
      knownCode: 'rate_limited',
      message: '',
      retryAfterSeconds: 60,
    });
    api.login.mockResolvedValueOnce(limited);
    const outcome = await actions.login('DEMO1-AAAAB');
    expect(outcome.kind === 'failed' ? outcome.failure : null).toMatchObject({
      retryAfterSeconds: 60,
    });
    expect(store.authenticate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('una comprobación vieja que vuelve después del ingreso no cierra la sesión nueva', async () => {
    const { actions, api, store } = setup();
    let release: (value: ApiResult<AccountResponse>) => void = () => undefined;
    api.getAccount.mockImplementationOnce(
      () => new Promise<ApiResult<AccountResponse>>((resolve) => (release = resolve)),
    );
    const check = actions.checkSession();
    await actions.login('DEMO1-AAAAA');
    release(UNAUTHORIZED);
    await check;
    expect(store.setAnonymous).not.toHaveBeenCalled();
  });
});

describe('logout y modo invitado', () => {
  it('logout cierra la sesión local y va a /ingreso', async () => {
    const { actions, api, store, navigate } = setup();
    await actions.logout();
    expect(api.logout).toHaveBeenCalled();
    expect(store.setAnonymous).toHaveBeenCalled();
    expect(store.setGuest).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith(LOGIN_ROUTE, { replace: true });
  });

  it('sin red, logout igual cierra la sesión local', async () => {
    const { actions, api, store } = setup();
    api.logout.mockResolvedValueOnce(OFFLINE);
    await actions.logout();
    expect(store.setAnonymous).toHaveBeenCalled();
  });

  it('una cancelación no cierra nada', async () => {
    const { actions, api, store } = setup();
    api.logout.mockResolvedValueOnce(fail({ kind: 'aborted' }));
    await actions.logout();
    expect(store.setAnonymous).not.toHaveBeenCalled();
  });

  it('enterAsGuest guarda la elección y va a la terminal', () => {
    const { actions, store, navigate } = setup();
    actions.enterAsGuest();
    expect(store.setGuest).toHaveBeenCalledWith(true);
    expect(navigate).toHaveBeenCalledWith(TERMINAL_ROUTE);
  });
});
