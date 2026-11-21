/**
 * DEF-003 (cerrado; queda como regresión): una cantidad que el contrato acepta pero que la columna
 * `orders.quantity` (`DECIMAL(28,8)`) no puede guardar hacía que `POST /orders` respondiera 500.
 * Desde el PR #21 responde 422 `invalid_quantity`, no guarda la orden y deja el intento en
 * `audit_logs` (`order.refused`). Ver `docs/qa/defectos.md`.
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
import { prepareTestDatabase } from '../../apps/api/src/testing/test-database.js';
import { NOW, sessionHeaders, startApi, type Api, type SessionHeaders } from './api-harness.js';

const databaseUrl = await prepareTestDatabase('coin_qa_def003');

describe.skipIf(!databaseUrl)('DEF-003 contra Postgres', () => {
  let db: Db;
  let app: Api;
  let accountId: string;
  let session: SessionHeaders;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await seedInstruments(db);
    const competition = await db.competition.create({
      data: {
        name: 'QA DEF-003',
        startsAt: new Date(NOW - 1000),
        endsAt: new Date(NOW + 60 * 60 * 1000),
        initialBalance: '100000.00',
      },
    });
    const account = await createAccount(db, {
      competitionId: competition.id,
      displayName: 'QA DEF-003',
      enrollmentCode: generateEnrollmentCode(),
      now: new Date(NOW),
    });
    accountId = account.accountId;
    session = sessionHeaders(account.accountId, account.userId);
    const ticks = new MemoryTickSource();
    ticks.set('BTCUSD', { bid: '60000.00', ask: '60010.00', ts: NOW });
    app = await startApi(db, ticks);
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  /** Compra de BTCUSD con la cantidad escrita tal cual en el JSON (por ejemplo `1e-30`). */
  function buy(quantity: string, clientOrderId: string = randomUUID()) {
    return app.inject({
      method: 'POST',
      url: '/orders',
      headers: { ...session, 'content-type': 'application/json' },
      payload: `{"symbol":"BTCUSD","side":"buy","type":"market","quantity":${quantity},"clientOrderId":"${clientOrderId}"}`,
    });
  }

  function countOrders(): Promise<number> {
    return db.order.count({ where: { accountId } });
  }

  it('control: una compra válida de 0,01 BTC se ejecuta (201)', async () => {
    expect((await buy('0.01')).statusCode).toBe(201);
  });

  it('DEF-003: una cantidad que no cabe en DECIMAL(28,8) responde 422 sin orden y queda auditada', async () => {
    for (const quantity of ['1e-30', '4e-9', '1e20', '1e21']) {
      const clientOrderId = randomUUID();
      const ordersBefore = await countOrders();

      const response = await buy(quantity, clientOrderId);

      expect(response.statusCode, `quantity ${quantity}`).toBe(422);
      expect(response.json().error.code, `quantity ${quantity}`).toBe('invalid_quantity');
      expect(await countOrders(), `quantity ${quantity}`).toBe(ordersBefore);
      // Evidencia de la conducta 5 del reglamento: el intento queda con su cantidad.
      const refused = await db.auditLog.findMany({
        where: { action: 'order.refused', entityId: clientOrderId },
      });
      expect(refused, `quantity ${quantity}`).toHaveLength(1);
      expect(refused[0]?.accountId).toBe(accountId);
      expect((refused[0]?.payload as { quantity?: unknown }).quantity).toBe(
        String(Number(quantity)),
      );
    }
  });

  it('bordes: una cantidad que cabe justo en la columna se guarda como orden (201)', async () => {
    // 8 decimales y menos de 10^20: caben. El motor las rechaza por otras reglas, pero la orden
    // rechazada se guarda con su motivo, como cualquier otra.
    for (const quantity of ['0.00000001', '12345678901234567000']) {
      const ordersBefore = await countOrders();

      const response = await buy(quantity);

      expect(response.statusCode, `quantity ${quantity}`).toBe(201);
      expect(response.json().status, `quantity ${quantity}`).toBe('rejected');
      expect(await countOrders(), `quantity ${quantity}`).toBe(ordersBefore + 1);
    }
  });
});
