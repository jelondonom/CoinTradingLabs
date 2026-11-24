import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGuestChoice, saveGuestChoice } from './guest-choice.js';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn((key: string) => void data.delete(key)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  saveGuestChoice(false, undefined);
});

describe('guest-choice', () => {
  it('guarda y lee la elección en el almacenamiento de la pestaña', () => {
    const storage = fakeStorage();
    expect(readGuestChoice(storage)).toBe(false);
    saveGuestChoice(true, storage);
    expect(readGuestChoice(storage)).toBe(true);
    saveGuestChoice(false, storage);
    expect(readGuestChoice(storage)).toBe(false);
  });

  it('por defecto usa sessionStorage y nunca localStorage', () => {
    const session = fakeStorage();
    const local = fakeStorage();
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('localStorage', local);

    saveGuestChoice(true);
    expect(readGuestChoice()).toBe(true);
    expect(session.setItem).toHaveBeenCalled();
    expect(local.setItem).not.toHaveBeenCalled();
    expect(local.getItem).not.toHaveBeenCalled();
  });

  it('si el almacenamiento falla, la elección queda en memoria', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    saveGuestChoice(true, broken);
    expect(readGuestChoice(broken)).toBe(true);
  });
});
