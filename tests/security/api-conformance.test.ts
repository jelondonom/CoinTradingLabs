/**
 * La API real frente a los esquemas del contrato v2, sin Postgres. La base es falsa y anota si
 * alguien la toca: así se sabe si un cuerpo pasó la validación de la ruta.
 *
 * - Seguridad: lo que el contrato rechaza, la API lo rechaza con 400 antes de tocar la base.
 * - Conformidad: lo que el contrato acepta, la API también lo deja pasar.
 *
 * Se compara sobre el cuerpo tal como viaja (JSON). Fastify rechaza por diseño `__proto__` y
 * `constructor.prototype`, aunque el esquema los descartaría; los generadores no los usan aquí
 * (eso lo cubre O8 en `payloads-v2.test.ts`).
 */
import { randomUUID } from 'node:crypto';
import { loginRequestSchema, placeOrderRequestSchema } from '@coin/shared';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionHeaders, startApi, trackingDb, type Api } from './api-harness.js';
import { RUNS, anyJsonArb, loginCodeArb, orderBodyArb } from './payload-arbitraries.js';

const { db, touched } = trackingDb();
let app: Api;

beforeAll(async () => {
  app = await startApi(db);
});

afterAll(async () => {
  await app?.close();
});

/** Lo que de verdad recibe el servidor: `NaN` e `Infinity` viajan como `null`. */
function onTheWire(body: unknown): unknown {
  return JSON.parse(JSON.stringify(body));
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  touched.length = 0;
  const response = await app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...headers },
    payload: JSON.stringify(body),
  });
  return { status: response.statusCode, reachedDb: touched.length > 0 };
}

describe('POST /orders', () => {
  const session = sessionHeaders(randomUUID(), randomUUID());

  it('A1: rechaza con 400 y sin tocar la base lo que el contrato rechaza; deja pasar lo demás', async () => {
    await fc.assert(
      fc.asyncProperty(orderBodyArb, async (body) => {
        const accepted = placeOrderRequestSchema.safeParse(onTheWire(body)).success;
        const result = await post('/orders', body, session);
        if (accepted) {
          expect(result.reachedDb).toBe(true);
        } else {
          expect(result.status).toBe(400);
          expect(result.reachedDb).toBe(false);
        }
      }),
      RUNS,
    );
  });
});

describe('POST /auth/login', () => {
  it('A2: rechaza con 400 y sin tocar la base un código que no es texto o que no viene', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyJsonArb.filter((value) => typeof value !== 'string'),
        async (code) => {
          for (const body of [{ code }, {}]) {
            const result = await post('/auth/login', body);
            expect(result.status).toBe(400);
            expect(result.reachedDb).toBe(false);
          }
        },
      ),
      RUNS,
    );
  });

  it('DEF-004: aplica el esquema del contrato (código sin espacios alrededor, de 4 a 64)', async () => {
    await fc.assert(
      fc.asyncProperty(loginCodeArb, async (code) => {
        const accepted = loginRequestSchema.safeParse(onTheWire({ code })).success;
        const result = await post('/auth/login', { code });
        expect(result.reachedDb).toBe(accepted);
        if (!accepted) expect(result.status).toBe(400);
      }),
      {
        ...RUNS,
        examples: [['  ab  '], [`${' '.repeat(30)}ABCDE${' '.repeat(30)}`]],
      },
    );
  });
});
