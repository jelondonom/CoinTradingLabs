import { randomUUID } from 'node:crypto';
import { accountSchema, orderSchema, positionSchema, staleAfterMs } from '@coin/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/prisma.js';
import { seedInstruments } from '../db/seed-instruments.js';
import { prepareTestDatabase } from '../testing/test-database.js';
import { createAccount } from './accounts/create-account.js';
import { generateEnrollmentCode } from './auth/enrollment-code.js';
import { AccountQueue } from './orders/account-queue.js';
import { MemoryTickSource } from './orders/tick-source.js';
import { MemoryCounterStore } from './rate-limit/counter-store.js';
import { RateLimiter, TradingRateLimits, type RateLimitConfig } from './rate-limit/rate-limiter.js';

/**
 * Tests de integración contra Postgres real, en una base propia (`coin_api_test`) que se recrea
 * en cada corrida: no tocan los datos de desarrollo. En el CI siempre corren (Postgres y Redis
 * en `ci.yml` desde el PR #14); en local hace falta `pnpm infra:up`.
 */
const databaseUrl = await prepareTestDatabase('coin_api_test');

/** 2027-01-15 08:00 UTC: inicio exacto de una ventana de un minuto y de una de 15 minutos. */
const START = 1_800_000_000_000;
const SECRET = 'secreto-de-prueba-secreto-de-prueba';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Límites con su propio almacén en memoria y el reloj del test. */
function rateLimits(now: () => number, config: RateLimitConfig): TradingRateLimits {
  return new TradingRateLimits(new RateLimiter(new MemoryCounterStore(), now, () => {}), config);
}

describe.skipIf(!databaseUrl)('trading contra Postgres', () => {
  let db: Db;
  let app: FastifyInstance;
  let competitionId: string;
  let now = START;
  const ticks = new MemoryTickSource();

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await seedInstruments(db);
    const competition = await db.competition.create({
      data: {
        name: 'Competencia de prueba',
        startsAt: new Date(START - 1000),
        endsAt: new Date(START + 60 * 60 * 1000),
        initialBalance: '100000.00',
      },
    });
    competitionId = competition.id;
    app = await buildApp({
      checks: {},
      trading: {
        db,
        ticks,
        queue: new AccountQueue(),
        now: () => now,
        tokenSecret: SECRET,
        tokenTtlMs: 60 * 60 * 1000,
        // Los números propuestos de D-13: los demás tests nunca deben toparse con ellos.
        rateLimits: rateLimits(() => now, {
          loginFailuresPer15Min: 100,
          ordersPerMinute: 30,
          ordersPerDay: 1000,
        }),
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  /** Cuenta nueva con sesión iniciada. Cada test usa la suya. */
  async function newTrader(): Promise<{ accountId: string; headers: { authorization: string } }> {
    const enrollmentCode = generateEnrollmentCode();
    const { accountId } = await createAccount(db, {
      competitionId,
      displayName: 'Trader de prueba',
      enrollmentCode,
      now: new Date(now),
    });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { code: enrollmentCode.toLowerCase() },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().accountId).toBe(accountId);
    return { accountId, headers: { authorization: `Bearer ${login.json().token}` } };
  }

  function setBtc(bid: string, ask: string, ts = now): void {
    ticks.set('BTCUSD', { bid, ask, ts });
  }

  /** Contrato v2: `clientOrderId` es obligatorio; si el caso no trae uno, se genera. */
  function order(headers: { authorization: string }, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/orders',
      headers,
      payload: { clientOrderId: randomUUID(), ...payload },
    });
  }

  /** Invariante 1: la suma del libro contable es el saldo de la cuenta. */
  async function expectLedgerMatchesBalance(accountId: string): Promise<string> {
    const account = await db.account.findUniqueOrThrow({ where: { id: accountId } });
    const sum = await db.ledgerEntry.aggregate({ where: { accountId }, _sum: { amount: true } });
    expect(sum._sum.amount?.toFixed(2)).toBe(account.balance.toFixed(2));
    return account.balance.toFixed(2);
  }

  it('login: rechaza un código desconocido y un cuerpo inválido', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { code: 'ZZZZZ-ZZZZZ' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('unauthorized');

    const invalid = await app.inject({ method: 'POST', url: '/auth/login', payload: {} });
    expect(invalid.statusCode).toBe(400);
  });

  it('exige sesión en /orders y /account', async () => {
    const payload = { symbol: 'BTCUSD', side: 'buy', type: 'market', quantity: 0.1 };
    expect((await app.inject({ method: 'POST', url: '/orders', payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/account' })).statusCode).toBe(401);
    const forged = { authorization: 'Bearer abc.def' };
    expect((await order(forged, payload)).statusCode).toBe(401);
  });

  it('una cuenta nueva nace con 100.000 USD desde el libro contable', async () => {
    const trader = await newTrader();
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('100000.00');

    const view = await app.inject({ method: 'GET', url: '/account', headers: trader.headers });
    const account = accountSchema.parse(view.json().account);
    expect(account.balance).toBe(100000);
    expect(account.equity).toBe(100000);
    expect(view.json().positions).toEqual([]);
  });

  it('ejemplo completo: compra al ask, venta parcial al bid, P&L y equity', async () => {
    const trader = await newTrader();
    setBtc('60000.00', '60010.00');

    const buy = await order(trader.headers, {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'market',
      quantity: 0.5,
      clientOrderId: randomUUID(),
      // El cliente no decide el precio: este campo se ignora.
      price: 1,
    });
    expect(buy.statusCode).toBe(201);
    const bought = orderSchema.parse(buy.json());
    expect(bought.status).toBe('filled');
    expect(bought.filledPrice).toBe(60010);
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('69995.00');

    setBtc('62000.00', '62010.00');
    const sell = await order(trader.headers, {
      symbol: 'BTCUSD',
      side: 'sell',
      type: 'market',
      quantity: 0.2,
      clientOrderId: randomUUID(),
    });
    expect(sell.statusCode).toBe(201);
    expect(orderSchema.parse(sell.json()).filledPrice).toBe(62000);
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('82395.00');

    const view = await app.inject({ method: 'GET', url: '/account', headers: trader.headers });
    const account = accountSchema.parse(view.json().account);
    const [position] = (view.json().positions as unknown[]).map((item) =>
      positionSchema.parse(item),
    );
    expect(account.balance).toBe(82395);
    expect(account.equity).toBe(100995);
    expect(position).toMatchObject({
      symbol: 'BTCUSD',
      side: 'long',
      quantity: 0.3,
      avgEntryPrice: 60010,
      marketPrice: 62000,
      unrealizedPnl: 597,
      realizedPnl: 398,
    });

    // La ejecución es auditable: guarda el tick usado y deja rastro en audit_log.
    const fills = await db.fill.findMany({
      where: { accountId: trader.accountId },
      orderBy: { createdAt: 'asc' },
    });
    expect(fills.map((fill) => fill.notional.toFixed(2))).toEqual(['30005.00', '12400.00']);
    expect(fills[1]?.realizedPnl.toFixed(2)).toBe('398.00');
    expect(fills[1]?.tickBid.toFixed(2)).toBe('62000.00');
    const audit = await db.auditLog.findMany({
      where: { accountId: trader.accountId },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((row) => row.action)).toEqual([
      'account.created',
      'order.filled',
      'order.filled',
    ]);
  });

  it('venta total: cierra la posición y deja de aparecer en la cuenta', async () => {
    const trader = await newTrader();
    setBtc('60000.00', '60010.00');
    await order(trader.headers, { symbol: 'BTCUSD', side: 'buy', type: 'market', quantity: 0.5 });
    const sell = await order(trader.headers, {
      symbol: 'BTCUSD',
      side: 'sell',
      type: 'market',
      quantity: 0.5,
    });
    expect(sell.json().status).toBe('filled');

    // Compró a 60.010 y vendió a 60.000: pierde el spread, 5,00.
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('99995.00');
    const closed = await db.position.findFirstOrThrow({ where: { accountId: trader.accountId } });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.quantity.toFixed(2)).toBe('0.00');
    expect(closed.costBasis.toFixed(2)).toBe('0.00');
    expect(closed.realizedPnl.toFixed(2)).toBe('-5.00');

    const view = await app.inject({ method: 'GET', url: '/account', headers: trader.headers });
    expect(view.json().positions).toEqual([]);

    // Puede volver a abrir una posición en el mismo símbolo.
    const again = await order(trader.headers, {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'market',
      quantity: 0.1,
    });
    expect(again.json().status).toBe('filled');
    expect(await db.position.count({ where: { accountId: trader.accountId } })).toBe(2);
  });

  it('rechazos: no mueven dinero y quedan guardados con su motivo', async () => {
    const trader = await newTrader();
    const base = { symbol: 'BTCUSD', type: 'market' };

    // Precio obsoleto: la base guarda `stale_price`; el contrato aún solo admite `no_price`.
    setBtc('60000.00', '60010.00', now - staleAfterMs('BTCUSD') - 1);
    const stale = await order(trader.headers, { ...base, side: 'buy', quantity: 0.1 });
    expect(stale.statusCode).toBe(201);
    expect(orderSchema.parse(stale.json())).toMatchObject({
      status: 'rejected',
      rejectReason: 'no_price',
      filledPrice: null,
    });
    const stored = await db.order.findUniqueOrThrow({ where: { id: stale.json().id } });
    expect(stored.rejectReason).toBe('stale_price');

    ticks.set('BTCUSD', null);
    const noPrice = await order(trader.headers, { ...base, side: 'buy', quantity: 0.1 });
    expect(noPrice.json().rejectReason).toBe('no_price');

    setBtc('60000.00', '60010.00');
    const tooBig = await order(trader.headers, { ...base, side: 'buy', quantity: 2 });
    expect(tooBig.json().rejectReason).toBe('insufficient_funds');
    const noPosition = await order(trader.headers, { ...base, side: 'sell', quantity: 0.1 });
    expect(noPosition.json().rejectReason).toBe('insufficient_position');
    const tooPrecise = await order(trader.headers, { ...base, side: 'buy', quantity: 0.000001 });
    expect(tooPrecise.json().rejectReason).toBe('invalid_quantity');

    // Fuera de la ventana de la competencia.
    const previous = now;
    now = START + 2 * 60 * 60 * 1000;
    const loginAgain = await newTrader();
    setBtc('60000.00', '60010.00');
    const closed = await order(loginAgain.headers, { ...base, side: 'buy', quantity: 0.1 });
    expect(closed.json().rejectReason).toBe('market_closed');
    now = previous;

    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('100000.00');
    expect(await db.fill.count({ where: { accountId: trader.accountId } })).toBe(0);
    expect(
      await db.auditLog.count({ where: { accountId: trader.accountId, action: 'order.rejected' } }),
    ).toBe(5);
  });

  it('umbral obsoleto por símbolo desde @coin/shared (D-11)', async () => {
    const trader = await newTrader();
    // EURUSD recibe ticks con menos frecuencia que BTCUSD y por eso aguanta más sin precio nuevo.
    // Si los dos umbrales se igualan, este caso deja de probar algo.
    expect(staleAfterMs('EURUSD')).toBeGreaterThan(staleAfterMs('BTCUSD'));
    const setEur = (ts: number) => ticks.set('EURUSD', { bid: '1.0840', ask: '1.0850', ts });
    const storedReason = async (id: string) =>
      (await db.order.findUniqueOrThrow({ where: { id } })).rejectReason;
    const buy = (symbol: string, quantity: number) =>
      order(trader.headers, { symbol, side: 'buy', type: 'market', quantity });

    // El mismo tick, viejo para BTCUSD y vigente para EURUSD: así lo muestra market-data.
    const age = staleAfterMs('BTCUSD') + 1;
    setBtc('60000.00', '60010.00', now - age);
    setEur(now - age);
    expect(await storedReason((await buy('BTCUSD', 0.1)).json().id)).toBe('stale_price');
    expect((await buy('EURUSD', 100)).json().status).toBe('filled');

    // Pasado su propio umbral, EURUSD también es obsoleto.
    setEur(now - staleAfterMs('EURUSD') - 1);
    expect(await storedReason((await buy('EURUSD', 100)).json().id)).toBe('stale_price');

    // Solo la compra vigente movió dinero: 100 × 1,0850 = 108,50.
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('99891.50');
    setBtc('60000.00', '60010.00');
    ticks.set('EURUSD', null);
  });

  it('rechaza con 400 un cuerpo fuera de contrato', async () => {
    const trader = await newTrader();
    const cases = [
      { symbol: 'DOGEUSD', side: 'buy', type: 'market', quantity: 1 },
      { symbol: 'BTCUSD', side: 'buy', type: 'limit', quantity: 1 },
      { symbol: 'BTCUSD', side: 'buy', type: 'market', quantity: -1 },
      { symbol: 'BTCUSD', side: 'buy', type: 'market', quantity: '1' },
    ];
    for (const payload of cases) {
      const response = await order(trader.headers, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('invalid_request');
    }
    expect(await db.order.count({ where: { accountId: trader.accountId } })).toBe(0);
  });

  it('idempotencia: repetir el clientOrderId no ejecuta dos veces', async () => {
    const trader = await newTrader();
    setBtc('60000.00', '60010.00');
    const payload = {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'market',
      quantity: 0.5,
      clientOrderId: randomUUID(),
    };

    const first = await order(trader.headers, payload);
    // El precio cambia, pero el reintento devuelve la orden original.
    setBtc('70000.00', '70010.00');
    const second = await order(trader.headers, payload);
    const burst = await Promise.all(
      Array.from({ length: 5 }, () => order(trader.headers, payload)),
    );

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    for (const response of burst) expect(response.json().id).toBe(first.json().id);
    expect(await db.fill.count({ where: { accountId: trader.accountId } })).toBe(1);
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('69995.00');
  });

  it('concurrencia: órdenes simultáneas nunca dejan el saldo en negativo', async () => {
    const trader = await newTrader();
    setBtc('60000.00', '60010.00');
    // Cada compra cuesta 30.005,00: solo caben tres en 100.000,00.
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        order(trader.headers, { symbol: 'BTCUSD', side: 'buy', type: 'market', quantity: 0.5 }),
      ),
    );
    const statuses = responses.map((response) => response.json().status as string);

    expect(statuses.filter((status) => status === 'filled')).toHaveLength(3);
    expect(statuses.filter((status) => status === 'rejected')).toHaveLength(7);
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('9985.00');
    const position = await db.position.findFirstOrThrow({ where: { accountId: trader.accountId } });
    expect(position.quantity.toFixed(1)).toBe('1.5');
    expect(position.costBasis.toFixed(2)).toBe('90015.00');
  });

  it('el bloqueo de la cuenta protege aunque haya dos procesos (dos colas)', async () => {
    const trader = await newTrader();
    setBtc('60000.00', '60010.00');
    const deps = () => ({
      db,
      ticks,
      queue: new AccountQueue(),
      now: () => now,
    });
    const { placeOrder } = await import('./orders/place-order.js');
    const request = { symbol: 'BTCUSD', side: 'buy', type: 'market', quantity: 0.9 } as const;

    // 0,9 BTC cuestan 54.009,00: solo cabe una.
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        placeOrder(deps(), trader.accountId, { ...request, clientOrderId: randomUUID() }),
      ),
    );

    expect(results.filter((result) => result.order.status === 'filled')).toHaveLength(1);
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('45991.00');
  });

  it('ledger_entries y audit_log no admiten UPDATE ni DELETE', async () => {
    const trader = await newTrader();
    await expect(
      db.ledgerEntry.updateMany({ where: { accountId: trader.accountId }, data: { amount: '1' } }),
    ).rejects.toThrow(/solo de inserción/);
    await expect(
      db.ledgerEntry.deleteMany({ where: { accountId: trader.accountId } }),
    ).rejects.toThrow(/solo de inserción/);
    await expect(
      db.auditLog.deleteMany({ where: { accountId: trader.accountId } }),
    ).rejects.toThrow(/solo de inserción/);
    await expect(db.$executeRawUnsafe('TRUNCATE "audit_log"')).rejects.toThrow(/solo de inserción/);
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('100000.00');
  });

  it('DEF-003: una cantidad que no cabe en la columna responde 422, sin orden, y queda auditada', async () => {
    const trader = await newTrader();
    setBtc('60000.00', '60010.00');
    // JSON escrito tal cual, para que la cantidad llegue con su notación (por ejemplo `1e-30`).
    const raw = (quantity: string) =>
      app.inject({
        method: 'POST',
        url: '/orders',
        headers: { ...trader.headers, 'content-type': 'application/json' },
        payload: `{"symbol":"BTCUSD","side":"buy","type":"market","quantity":${quantity},"clientOrderId":"${randomUUID()}"}`,
      });

    for (const quantity of ['1e-30', '4e-9', '1e20', '1e21']) {
      const response = await raw(quantity);
      expect(response.statusCode, quantity).toBe(422);
      expect(response.json().error.code).toBe('invalid_quantity');
    }
    expect(await db.order.count({ where: { accountId: trader.accountId } })).toBe(0);
    expect(await expectLedgerMatchesBalance(trader.accountId)).toBe('100000.00');

    const refused = await db.auditLog.findMany({
      where: { accountId: trader.accountId, action: 'order.refused' },
      orderBy: { id: 'asc' },
    });
    expect(refused.every((entry) => entry.entityType === 'order_request')).toBe(true);
    expect(refused.map((entry) => (entry.payload as { quantity: string }).quantity)).toEqual([
      '1e-30',
      '4e-9',
      '100000000000000000000',
      '1e+21',
    ]);

    // 1e19 sí cabe: llega al motor, que la rechaza por saldo y la guarda como siempre.
    const fits = await raw('1e19');
    expect(fits.statusCode).toBe(201);
    expect(fits.json()).toMatchObject({ status: 'rejected', rejectReason: 'insufficient_funds' });
  });

  describe('límites de peticiones (D-13)', () => {
    // App aparte, con límites chicos, su propio reloj y su propio almacén: no afecta a los
    // demás tests. Cada caso usa IP y cuenta propias.
    let limited: FastifyInstance;
    let clock = START;

    beforeAll(async () => {
      limited = await buildApp({
        checks: {},
        trading: {
          db,
          ticks,
          queue: new AccountQueue(),
          now: () => clock,
          tokenSecret: SECRET,
          tokenTtlMs: 7 * DAY_MS,
          rateLimits: rateLimits(() => clock, {
            loginFailuresPer15Min: 3,
            ordersPerMinute: 2,
            ordersPerDay: 3,
          }),
        },
      });
    });

    afterAll(async () => {
      await limited?.close();
    });

    async function enroll(): Promise<string> {
      const enrollmentCode = generateEnrollmentCode();
      await createAccount(db, {
        competitionId,
        displayName: 'Trader con límites',
        enrollmentCode,
        now: new Date(clock),
      });
      return enrollmentCode;
    }

    function login(payload: Record<string, unknown>, remoteAddress: string) {
      return limited.inject({ method: 'POST', url: '/auth/login', remoteAddress, payload });
    }

    it('login: tras 3 fallos la IP recibe 429 aun con un código válido, hasta que pasa la ventana', async () => {
      const code = await enroll();
      const ip = '203.0.113.7';
      // Los logins exitosos no cuentan.
      for (let i = 0; i < 5; i += 1) expect((await login({ code }, ip)).statusCode).toBe(200);
      expect((await login({}, ip)).statusCode).toBe(400);
      expect((await login({ code: 'XXXXX-XXXX1' }, ip)).statusCode).toBe(401);
      expect((await login({ code: 'XXXXX-XXXX2' }, ip)).statusCode).toBe(401);

      const blocked = await login({ code }, ip);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe('rate_limited');
      expect(blocked.headers['retry-after']).toBe('900');
      // Otra IP no se ve afectada.
      expect((await login({ code }, '203.0.113.8')).statusCode).toBe(200);

      clock += 15 * 60 * 1000;
      expect((await login({ code }, ip)).statusCode).toBe(200);
    });

    it('órdenes: 429 por minuto y luego por día; las peticiones sin sesión no cuentan', async () => {
      const session = await login({ code: await enroll() }, '203.0.113.9');
      const headers = { authorization: `Bearer ${session.json().token}` };
      const placeOrderAs = (auth?: { authorization: string }) =>
        limited.inject({
          method: 'POST',
          url: '/orders',
          headers: auth,
          payload: {
            clientOrderId: randomUUID(),
            symbol: 'BTCUSD',
            side: 'buy',
            type: 'market',
            quantity: 0.001,
          },
        });

      for (let i = 0; i < 3; i += 1) expect((await placeOrderAs()).statusCode).toBe(401);

      // 201 aunque el motor la rechace: el límite cuenta peticiones, no ejecuciones.
      expect((await placeOrderAs(headers)).statusCode).toBe(201);
      expect((await placeOrderAs(headers)).statusCode).toBe(201);
      const perMinute = await placeOrderAs(headers);
      expect(perMinute.statusCode).toBe(429);
      expect(perMinute.json().error.code).toBe('rate_limited');
      expect(perMinute.headers['retry-after']).toBe('60');

      clock += 60 * 1000;
      expect((await placeOrderAs(headers)).statusCode).toBe(201);
      const perDay = await placeOrderAs(headers);
      expect(perDay.statusCode).toBe(429);
      const nextMidnight = Math.ceil(clock / DAY_MS) * DAY_MS;
      expect(perDay.headers['retry-after']).toBe(String((nextMidnight - clock) / 1000));

      clock = nextMidnight;
      expect((await placeOrderAs(headers)).statusCode).toBe(201);
    });
  });
});
