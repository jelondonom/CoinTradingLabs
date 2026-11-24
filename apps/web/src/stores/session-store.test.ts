import { afterEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './session-store.js';

const ACCOUNT_ID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e';

afterEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe('session-store', () => {
  it('arranca comprobando, sin cuenta ni aviso', () => {
    const state = useSessionStore.getState();
    expect(state.status).toBe('checking');
    expect(state.accountId).toBeNull();
    expect(state.notice).toBeNull();
  });

  it('authenticate abre la sesión, quita el modo invitado y el aviso', () => {
    useSessionStore.setState({ guest: true, notice: 'expired' });
    useSessionStore.getState().authenticate(ACCOUNT_ID);
    expect(useSessionStore.getState()).toMatchObject({
      status: 'authenticated',
      accountId: ACCOUNT_ID,
      guest: false,
      notice: null,
    });
  });

  it('expire con la sesión abierta deja el aviso "tu sesión terminó"', () => {
    useSessionStore.getState().authenticate(ACCOUNT_ID);
    useSessionStore.getState().expire();
    expect(useSessionStore.getState()).toMatchObject({
      status: 'anonymous',
      accountId: null,
      notice: 'expired',
    });
  });

  it('expire sin sesión (el 401 de la comprobación al arrancar) no deja aviso', () => {
    useSessionStore.getState().expire();
    expect(useSessionStore.getState()).toMatchObject({ status: 'anonymous', notice: null });
  });

  it('setUnknown no cierra la sesión del servidor: solo dice que no se sabe', () => {
    useSessionStore.getState().setUnknown();
    expect(useSessionStore.getState().status).toBe('unknown');
  });
});
