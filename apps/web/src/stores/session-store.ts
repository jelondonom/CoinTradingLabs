import { create } from 'zustand';
import { readGuestChoice, saveGuestChoice } from '../features/auth/guest-choice.js';

/**
 * Estado de la sesión en el cliente. La sesión real es la cookie `httpOnly` (D-04): el cliente no
 * la ve ni la guarda, solo sabe lo que le dijo el servidor.
 * - `checking`: comprobando al arrancar.
 * - `authenticated` / `anonymous`: el servidor respondió (200 / 401).
 * - `unknown`: sin red o con el servidor caído. La cookie puede seguir vigente: no se manda a
 *   nadie a `/ingreso` y se vuelve a comprobar sola.
 */
export type SessionStatus = 'checking' | 'authenticated' | 'anonymous' | 'unknown';

type SessionState = {
  status: SessionStatus;
  accountId: string | null;
  /** Eligió "Ver el mercado sin ingresar" en esta pestaña. */
  guest: boolean;
  /** Aviso para la pantalla de ingreso. */
  notice: 'expired' | null;
  authenticate: (accountId: string) => void;
  setAnonymous: () => void;
  setUnknown: () => void;
  /** Un 401 con sesión (B4). Solo hay aviso si la sesión estaba abierta. */
  expire: () => void;
  setGuest: (guest: boolean) => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'checking',
  accountId: null,
  guest: readGuestChoice(),
  notice: null,
  authenticate: (accountId) => {
    saveGuestChoice(false);
    set({ status: 'authenticated', accountId, guest: false, notice: null });
  },
  // Sin sesión por decisión propia (Salir) o del servidor al arrancar: sin aviso de "sesión terminó".
  setAnonymous: () => set({ status: 'anonymous', accountId: null, notice: null }),
  setUnknown: () => set({ status: 'unknown' }),
  expire: () => {
    const wasAuthenticated = get().status === 'authenticated';
    set({
      status: 'anonymous',
      accountId: null,
      notice: wasAuthenticated ? 'expired' : get().notice,
    });
  },
  setGuest: (guest) => {
    saveGuestChoice(guest);
    set({ guest });
  },
}));
