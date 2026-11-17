import { createHash, randomInt } from 'node:crypto';

/** Sin 0, O, 1, I ni L: se confunden al copiar el código a mano. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

/** Quita espacios y guiones y pasa a mayúsculas: `abcde-fghjk` y `ABCDEFGHJK` son el mismo. */
export function normalizeEnrollmentCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/** Valor que se guarda en `users.login_id`. El código en claro nunca se guarda. */
export function hashEnrollmentCode(code: string): string {
  return createHash('sha256').update(normalizeEnrollmentCode(code)).digest('hex');
}

/** Código aleatorio de 10 caracteres con formato `XXXXX-XXXXX` (unos 49 bits). */
export function generateEnrollmentCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}
