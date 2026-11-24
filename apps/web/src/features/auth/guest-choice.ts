/**
 * La elección "Ver el mercado sin ingresar" dura solo esa pestaña (`sessionStorage`), nunca
 * `localStorage`: un celular prestado o un computador del evento no salta `/ingreso` para el
 * siguiente participante. Si el almacenamiento falla (modo privado, bloqueado), queda en memoria.
 * La sesión en sí es solo la cookie `httpOnly`: aquí no se guarda nada de ella.
 */
const KEY = 'coin.guest';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

let memoryChoice = false;

function tabStorage(): StorageLike | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

export function readGuestChoice(storage: StorageLike | undefined = tabStorage()): boolean {
  try {
    if (storage) return storage.getItem(KEY) === '1';
  } catch {
    // Sin acceso al almacenamiento: vale lo que haya en memoria.
  }
  return memoryChoice;
}

export function saveGuestChoice(
  guest: boolean,
  storage: StorageLike | undefined = tabStorage(),
): void {
  memoryChoice = guest;
  try {
    if (!storage) return;
    if (guest) storage.setItem(KEY, '1');
    else storage.removeItem(KEY);
  } catch {
    // Queda en memoria.
  }
}
