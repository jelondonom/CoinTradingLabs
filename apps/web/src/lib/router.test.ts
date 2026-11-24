import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_ROUTE, navigate, routeFor } from './router.js';

describe('routeFor', () => {
  it('/ingreso es la pantalla de ingreso, con o sin barra al final', () => {
    expect(routeFor(LOGIN_ROUTE)).toBe('login');
    expect(routeFor('/ingreso/')).toBe('login');
  });

  it('cualquier otra ruta es la terminal', () => {
    expect(routeFor('/')).toBe('terminal');
    expect(routeFor('/mercados')).toBe('terminal');
    expect(routeFor('/ingresos')).toBe('terminal');
  });
});

describe('navigate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fakeWindow(pathname: string) {
    const win = {
      location: { pathname },
      history: {
        pushState: vi.fn((_state: unknown, _title: string, path: string) => {
          win.location.pathname = path;
        }),
        replaceState: vi.fn((_state: unknown, _title: string, path: string) => {
          win.location.pathname = path;
        }),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', win);
    return win;
  }

  it('agrega una entrada al historial, o la reemplaza con replace', () => {
    const win = fakeWindow('/');
    navigate(LOGIN_ROUTE);
    expect(win.history.pushState).toHaveBeenCalledWith(null, '', LOGIN_ROUTE);
    navigate('/', { replace: true });
    expect(win.history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('no toca el historial si ya está en esa ruta', () => {
    const win = fakeWindow(LOGIN_ROUTE);
    navigate(LOGIN_ROUTE);
    expect(win.history.pushState).not.toHaveBeenCalled();
  });
});
