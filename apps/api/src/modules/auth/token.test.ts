import { describe, expect, it } from 'vitest';
import {
  generateEnrollmentCode,
  hashEnrollmentCode,
  normalizeEnrollmentCode,
} from './enrollment-code.js';
import { signToken, verifyToken, type TokenClaims } from './token.js';

const SECRET = 'secreto-de-prueba-secreto-de-prueba';
const NOW = 1_800_000_000_000;
const claims: TokenClaims = {
  userId: '3f0c1c3e-6f4e-4c5e-9a55-0d3b0a4b1c11',
  accountId: '9b2d7a10-1c2f-4a57-8a3e-5f7f0f0d2e22',
  expiresAt: NOW + 60_000,
};

describe('token de sesión', () => {
  it('acepta un token propio y devuelve sus datos', () => {
    expect(verifyToken(signToken(claims, SECRET), SECRET, NOW)).toEqual(claims);
  });

  it('rechaza un token vencido, justo en el instante de vencimiento', () => {
    const token = signToken(claims, SECRET);
    expect(verifyToken(token, SECRET, claims.expiresAt)).toBeNull();
  });

  it('rechaza un token firmado con otro secreto', () => {
    expect(verifyToken(signToken(claims, 'otro-secreto'), SECRET, NOW)).toBeNull();
  });

  it('rechaza un token con el contenido alterado', () => {
    const [, signature] = signToken(claims, SECRET).split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...claims, accountId: '00000000-0000-4000-8000-000000000000' }),
    ).toString('base64url');
    expect(verifyToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('rechaza texto mal formado', () => {
    for (const token of ['', 'abc', 'a.b.c', '.', 'a.']) {
      expect(verifyToken(token, SECRET, NOW)).toBeNull();
    }
  });

  it('rechaza un contenido firmado que no cumple el esquema', () => {
    const token = signToken({ ...claims, userId: 'no-es-uuid' }, SECRET);
    expect(verifyToken(token, SECRET, NOW)).toBeNull();
  });
});

describe('código de inscripción', () => {
  it('ignora mayúsculas, espacios y guiones', () => {
    expect(normalizeEnrollmentCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
    expect(hashEnrollmentCode('abcde-fghjk')).toBe(hashEnrollmentCode('ABCDEFGHJK'));
    expect(hashEnrollmentCode('ABCDE-FGHJK')).not.toBe(hashEnrollmentCode('ABCDE-FGHJM'));
  });

  it('genera códigos con el formato esperado y distintos entre sí', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateEnrollmentCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });
});
