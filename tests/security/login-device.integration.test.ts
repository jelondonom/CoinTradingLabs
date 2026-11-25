/**
 * R17 de `docs/qa/plan.md`: bloqueo masivo del login por IP compartida (wifi del evento, D-13).
 *
 * Hoy el límite cuenta 100 fallos por IP cada 15 minutos y, agotado, esa IP recibe 429 aunque el
 * código sea válido: cientos de asistentes detrás de una sola IP se bloquean entre todos. El
 * Gerente aprobó el 2026-11-24 la solución del Backend, que llega con su tarea 4:
 *
 * - límite por dispositivo: cookie `coin_device` que pone la API, 10 fallos cada 15 minutos;
 * - techo por IP: 2.000 fallos cada 15 minutos;
 * - con el techo agotado, un dispositivo que ya entró con un código válido sigue entrando, pero
 *   sigue sujeto a sus 10 fallos;
 * - tope de G-A (Gerente, 2026-11-25): una cuenta marca como conocidos como máximo 5 dispositivos
 *   en 30 días. El sexto entra normalmente, pero no queda conocido. No se expulsa al más antiguo:
 *   rotar dispositivos anularía el tope.
 *
 * Los casos describen ese comportamiento esperado y van con `it.fails`, como un defecto abierto.
 * El PR del Backend que lo implemente voltea cada línea a `it` (D-21); QA confirma y cierra R17.
 *
 * Supuesto: la API pone la cookie `coin_device` en la respuesta de `POST /auth/login` cuando el
 * navegador no la trae (también en un fallo, porque el fallo ya cuenta para ese dispositivo). Cada
 * dispositivo de la prueba guarda la última cookie que recibe, como un navegador.
 *
 * Los números son los iniciales de la decisión; QA los valida (D-13). Cada caso usa su propia IP
 * porque los contadores viven en la misma API durante todo el archivo.
 *
 * Necesita Postgres para los códigos válidos: en el CI siempre corre; en local, sin
 * `pnpm infra:up`, se omite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../apps/api/src/db/prisma.js';
import { seedInstruments } from '../../apps/api/src/db/seed-instruments.js';
import { createAccount } from '../../apps/api/src/modules/accounts/create-account.js';
import { generateEnrollmentCode } from '../../apps/api/src/modules/auth/enrollment-code.js';
import { prepareTestDatabase } from '../../apps/api/src/testing/test-database.js';
import { NOW, startApi, type Api } from './api-harness.js';

/** Dispositivos conocidos por cuenta en 30 días (G-A, Gerente, 2026-11-25). */
const KNOWN_DEVICES_PER_ACCOUNT = 5;
/** Fallos por dispositivo en cada ventana de 15 minutos (Gerente, 2026-11-24). */
const DEVICE_FAILURES = 10;
/** Techo de fallos por IP en cada ventana de 15 minutos (Gerente, 2026-11-24). */
const IP_FAILURES_CEILING = 2_000;
const DEVICE_COOKIE = 'coin_device';
/** Tiene el formato de un código, pero ninguna cuenta lo usa. */
const WRONG_CODE = 'XXXXX-XXXXX';

const databaseUrl = await prepareTestDatabase('coin_qa_login_device');

describe.skipIf(!databaseUrl)('R17: login por dispositivo con techo por IP (D-13)', () => {
  let db: Db;
  let app: Api;
  let competitionId: string;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await seedInstruments(db);
    const competition = await db.competition.create({
      data: {
        name: 'QA R17',
        startsAt: new Date(NOW - 1000),
        endsAt: new Date(NOW + 60 * 60 * 1000),
        initialBalance: '100000.00',
      },
    });
    competitionId = competition.id;
    app = await startApi(db, undefined, { rateLimits: 'd13' });
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  /** Cuenta nueva; devuelve su código de inscripción. */
  async function enroll(): Promise<string> {
    const enrollmentCode = generateEnrollmentCode();
    await createAccount(db, {
      competitionId,
      displayName: 'QA R17',
      enrollmentCode,
      now: new Date(NOW),
    });
    return enrollmentCode;
  }

  /** Un navegador detrás de `ip`: manda su cookie `coin_device` y guarda la que reciba. */
  function device(ip: string) {
    let cookie: string | undefined;
    return {
      async login(code: string) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          remoteAddress: ip,
          headers: cookie ? { cookie: `${DEVICE_COOKIE}=${cookie}` } : {},
          payload: { code },
        });
        cookie = deviceCookieOf(response.headers['set-cookie']) ?? cookie;
        return response;
      },
      /** `count` intentos fallidos seguidos. */
      async fail(count: number) {
        for (let i = 0; i < count; i += 1) await this.login(WRONG_CODE);
      },
    };
  }

  it('control: un código válido entra (200) y uno inválido da 401', async () => {
    const browser = device('198.51.100.1');
    expect((await browser.login(WRONG_CODE)).statusCode).toBe(401);
    expect((await browser.login(await enroll())).statusCode).toBe(200);
  });

  it('1: un dispositivo con 10 fallos se bloquea; otro de la misma IP sigue entrando', async () => {
    const ip = '198.51.100.11';
    const code = await enroll();
    const blocked = device(ip);
    await blocked.fail(DEVICE_FAILURES);

    const refused = await blocked.login(code);
    expect(refused.statusCode).toBe(429);
    expect(refused.json().error.code).toBe('rate_limited');
    expect((await device(ip).login(code)).statusCode).toBe(200);
  });

  it('2: con fallos repartidos entre dispositivos, un código válido no recibe 429 antes del techo', async () => {
    const ip = '198.51.100.12';
    const code = await enroll();
    // 150 fallos: más que el límite de hoy por IP (100), menos que el techo y menos de 10 por
    // dispositivo.
    const devices = Array.from({ length: 30 }, () => device(ip));
    for (const browser of devices) await browser.fail(5);

    expect((await devices[0]!.login(code)).statusCode).toBe(200);
    expect((await device(ip).login(code)).statusCode).toBe(200);
  });

  it('3: con el techo de la IP agotado, un dispositivo conocido entra y uno nuevo no', async () => {
    const ip = '198.51.100.13';
    const code = await enroll();
    const known = device(ip);
    expect((await known.login(code)).statusCode).toBe(200);

    // Más fallos que el techo, de 10 en 10 por dispositivo: el techo queda agotado sin depender
    // de un conteo exacto.
    const attempts = IP_FAILURES_CEILING + 10 * DEVICE_FAILURES;
    for (let i = 0; i < attempts / DEVICE_FAILURES; i += 1) {
      await device(ip).fail(DEVICE_FAILURES);
    }

    expect((await known.login(code)).statusCode).toBe(200);
    const stranger = await device(ip).login(code);
    expect(stranger.statusCode).toBe(429);
    expect(stranger.json().error.code).toBe('rate_limited');
  }, 120_000);

  it('4: un dispositivo conocido con 10 fallos sí se bloquea', async () => {
    const ip = '198.51.100.14';
    const code = await enroll();
    const known = device(ip);
    expect((await known.login(code)).statusCode).toBe(200);
    await known.fail(DEVICE_FAILURES);

    expect((await known.login(code)).statusCode).toBe(429);
    expect((await device(ip).login(code)).statusCode).toBe(200);
  });

  it('5: con 5 dispositivos conocidos en la cuenta, el sexto entra pero no salta el techo (G-A)', async () => {
    const ip = '198.51.100.15';
    const code = await enroll();
    const devices = Array.from({ length: KNOWN_DEVICES_PER_ACCOUNT + 1 }, () => device(ip));
    // Los seis entran normalmente; solo los cinco primeros quedan conocidos.
    for (const browser of devices) expect((await browser.login(code)).statusCode).toBe(200);

    // Más fallos que el techo, de 10 en 10 por dispositivo nuevo, como en el caso 3.
    const attempts = IP_FAILURES_CEILING + 10 * DEVICE_FAILURES;
    for (let i = 0; i < attempts / DEVICE_FAILURES; i += 1) {
      await device(ip).fail(DEVICE_FAILURES);
    }

    for (const known of devices.slice(0, KNOWN_DEVICES_PER_ACCOUNT)) {
      expect((await known.login(code)).statusCode).toBe(200);
    }
    const sixth = await devices[KNOWN_DEVICES_PER_ACCOUNT]!.login(code);
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('rate_limited');
  }, 120_000);
});

/** Valor de la cookie `coin_device` en las cabeceras `Set-Cookie`, si viene. */
function deviceCookieOf(header: string | string[] | number | undefined): string | undefined {
  const cookies = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  for (const cookie of cookies) {
    const match = new RegExp(`^${DEVICE_COOKIE}=([^;]*)`).exec(cookie);
    if (match?.[1]) return match[1];
  }
  return undefined;
}
