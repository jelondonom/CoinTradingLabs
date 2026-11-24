import { describe, expect, it } from 'vitest';
import { LOGIN_ROUTE, TERMINAL_ROUTE } from '../../lib/router.js';
import { redirectFor } from './session-redirect.js';

describe('redirectFor', () => {
  it('sin sesión y sin modo invitado, la terminal lleva a /ingreso', () => {
    expect(redirectFor('anonymous', false, 'terminal')).toBe(LOGIN_ROUTE);
  });

  it('un invitado se queda en la terminal', () => {
    expect(redirectFor('anonymous', true, 'terminal')).toBeNull();
  });

  it('con sesión, /ingreso lleva a la terminal', () => {
    expect(redirectFor('authenticated', false, 'login')).toBe(TERMINAL_ROUTE);
  });

  it('comprobando o sin poder comprobar (sin red), nadie se mueve', () => {
    for (const route of ['terminal', 'login'] as const) {
      expect(redirectFor('checking', false, route)).toBeNull();
      expect(redirectFor('unknown', false, route)).toBeNull();
    }
  });

  it('sin sesión en /ingreso, o con sesión en la terminal, se queda', () => {
    expect(redirectFor('anonymous', false, 'login')).toBeNull();
    expect(redirectFor('authenticated', false, 'terminal')).toBeNull();
  });
});
