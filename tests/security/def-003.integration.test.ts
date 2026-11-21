/**
 * DEF-003 contra Postgres: una cantidad que el contrato acepta pero que la columna
 * `orders.quantity` (`DECIMAL(28,8)`, con `CHECK quantity > 0`) no puede guardar hace que
 * `POST /orders` responda 500. Ver `docs/qa/defectos.md`.
 *
 * Necesita Postgres: en el CI siempre corre; en local, sin `pnpm infra:up`, se omite.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../apps/api/src/db/prisma.js';
import { seedInstruments } from '../../apps/api/src/db/seed-instruments.js';
import { createAccount } from '../../apps/api/src/modules/accounts/create-account.js';
import { generateEnrollmentCode } from '../../apps/api/src/modules/auth/enrollment-code.js';
import { MemoryTickSource } from '../../apps/api/src/modules/orders/tick-source.js';
import { NOW, sessionHeaders, startApi, type Api } from './api-harness.js';
import { prepareDatabase } from './postgres.js';

const databaseUrl = await prepareDatabase('coin_qa_payloads');

describe.skipIf(!databaseUrl)('DEF-003 contra Postgres', () => {
  let db: Db;
  let app: Api;
  let session: { authorization: string };

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await seedInstruments(db);
    const competition = await db.competition.create({
      data: {
        name: 'QA payloads',
        startsAt: new Date(NOW - 1000),
        endsAt: new Date(NOW + 60 * 60 * 1000),
        initialBalance: '100000.00',
      },
    });
    const { accountId, userId } = await createAccount(db, {
      competitionId: competition.id,
      displayName: 'QA payloads',
      enrollmentCode: generateEnrollmentCode(),
      now: new Date(NOW),
    });
    session = sessionHeaders(accountId, userId);
    const ticks = new MemoryTickSource();
    ticks.set('BTCUSD', { bid: '60000.00', ask: '60010.00', ts: NOW });
    app = await startApi(db, ticks);
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  /** Compra de BTCUSD con la cantidad escrita tal cual en el JSON (por ejemplo `1e-30`). */
  function buy(quantity: string) {
    return app.inject({
      method: 'POST',
      url: '/orders',
      headers: { ...session, 'content-type': 'application/json' },
      payload: `{"symbol":"BTCUSD","side":"buy","type":"market","quantity":${quantity},"clientOrderId":"${randomUUID()}"}`,
    });
  }

  it('control: una compra válida de 0,01 BTC se ejecuta (201)', async () => {
    expect((await buy('0.01')).statusCode).toBe(201);
  });

  it('DEF-003: una cantidad que no cabe en DECIMAL(28,8) se responde sin error 500', async () => {
    for (const quantity of ['1e-30', '4e-9', '1e20', '1e21']) {
      expect((await buy(quantity)).statusCode, `quantity ${quantity}`).toBeLessThan(500);
    }
  });
});
