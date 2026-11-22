import { describe, expect, it } from 'vitest';
import {
  DESKTOP_QUERY,
  readMediaQuery,
  subscribeMediaQuery,
  type MatchMediaLike,
} from './use-media-query.js';

/** `matchMedia` falso: `resize` simula cruzar el corte. */
function fakeMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const matchMedia: MatchMediaLike = () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  });
  const resize = (next: boolean) => {
    matches = next;
    for (const listener of listeners) listener();
  };
  return { matchMedia, resize, listeners };
}

describe('readMediaQuery', () => {
  it('sin matchMedia (servidor o Node) responde false: la forma de celular', () => {
    expect(readMediaQuery(undefined, DESKTOP_QUERY)).toBe(false);
  });

  it('lee el valor actual de la media query', () => {
    expect(readMediaQuery(fakeMatchMedia(true).matchMedia, DESKTOP_QUERY)).toBe(true);
    expect(readMediaQuery(fakeMatchMedia(false).matchMedia, DESKTOP_QUERY)).toBe(false);
  });
});

describe('subscribeMediaQuery', () => {
  it('avisa al cruzar el corte y deja de avisar al cancelar', () => {
    const fake = fakeMatchMedia(false);
    let calls = 0;
    const unsubscribe = subscribeMediaQuery(fake.matchMedia, DESKTOP_QUERY, () => {
      calls += 1;
    });

    fake.resize(true);
    expect(calls).toBe(1);
    expect(readMediaQuery(fake.matchMedia, DESKTOP_QUERY)).toBe(true);

    unsubscribe();
    fake.resize(false);
    expect(calls).toBe(1);
    expect(fake.listeners.size).toBe(0);
  });

  it('sin matchMedia no se suscribe ni falla al cancelar', () => {
    const unsubscribe = subscribeMediaQuery(undefined, DESKTOP_QUERY, () => {
      throw new Error('no debería avisar');
    });
    expect(() => unsubscribe()).not.toThrow();
  });
});
