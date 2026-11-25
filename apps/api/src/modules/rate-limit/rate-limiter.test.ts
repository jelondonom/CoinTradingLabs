import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../errors/app-error.js';
import { MemoryCounterStore } from './counter-store.js';
import {
  LOGIN_FAILURE_WINDOW_MS,
  RateLimiter,
  TradingRateLimits,
  loginSubject,
  type CounterStore,
  type RateLimitRule,
} from './rate-limiter.js';

/** Medianoche UTC: aquí empiezan a la vez las ventanas de un minuto, de 15 minutos y de un día. */
const MIDNIGHT = Date.UTC(2027, 0, 15);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const perMinute: RateLimitRule = { name: 'test', limit: 3, windowMs: MINUTE };

function clockedLimiter(start = MIDNIGHT) {
  let now = start;
  const limiter = new RateLimiter(
    new MemoryCounterStore(),
    () => now,
    () => {},
  );
  return {
    limiter,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof AppError)) throw new Error('Se esperaba un AppError.');
  return error;
}

describe('RateLimiter.consume', () => {
  it('deja pasar hasta el límite y niega el siguiente con lo que falta de la ventana', async () => {
    const { limiter, advance } = clockedLimiter();
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.consume(perMinute, 'a')).allowed).toBe(true);
    }
    advance(15_000);
    expect(await limiter.consume(perMinute, 'a')).toEqual({ allowed: false, retryAfterMs: 45_000 });
  });

  it('cada sujeto tiene su propio contador', async () => {
    const { limiter } = clockedLimiter();
    for (let i = 0; i < 4; i += 1) await limiter.consume(perMinute, 'a');
    expect((await limiter.consume(perMinute, 'b')).allowed).toBe(true);
  });

  it('una ventana nueva empieza de cero', async () => {
    const { limiter, advance } = clockedLimiter();
    for (let i = 0; i < 4; i += 1) await limiter.consume(perMinute, 'a');
    advance(MINUTE);
    expect((await limiter.consume(perMinute, 'a')).allowed).toBe(true);
  });

  it('la ventana de un día va de medianoche a medianoche UTC', async () => {
    const perDay: RateLimitRule = { name: 'day', limit: 1, windowMs: DAY };
    const { limiter, advance } = clockedLimiter(MIDNIGHT + 23 * 60 * MINUTE);
    expect((await limiter.consume(perDay, 'a')).allowed).toBe(true);
    expect(await limiter.consume(perDay, 'a')).toEqual({
      allowed: false,
      retryAfterMs: 60 * MINUTE,
    });
    advance(60 * MINUTE);
    expect((await limiter.consume(perDay, 'a')).allowed).toBe(true);
  });

  it('una ráfaga simultánea no pasa del límite', async () => {
    const { limiter } = clockedLimiter();
    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume(perMinute, 'a')),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(3);
  });

  it('release devuelve el cupo, aunque ya haya empezado otra ventana no toca la nueva', async () => {
    const { limiter, advance } = clockedLimiter();
    const first = await limiter.consume(perMinute, 'a');
    await limiter.consume(perMinute, 'a');
    await limiter.consume(perMinute, 'a');
    if (!first.allowed) throw new Error('La primera debía pasar.');
    await first.release();
    expect((await limiter.consume(perMinute, 'a')).allowed).toBe(true);
    expect((await limiter.consume(perMinute, 'a')).allowed).toBe(false);

    // Un release tardío descuenta de su propia ventana, no de la nueva.
    const late = await limiter.consume({ ...perMinute, name: 'tarde' }, 'a');
    advance(MINUTE);
    if (!late.allowed) throw new Error('Debía pasar.');
    await late.release();
    for (let i = 0; i < 3; i += 1) await limiter.consume({ ...perMinute, name: 'tarde' }, 'a');
    expect((await limiter.consume({ ...perMinute, name: 'tarde' }, 'a')).allowed).toBe(false);
  });
});

describe('fail-open', () => {
  it('si el almacén falla, deja pasar y avisa cada vez', async () => {
    const down = new Error('sin Redis');
    const failing: CounterStore = {
      increment: () => Promise.reject(down),
      decrement: () => Promise.reject(down),
      addToCappedSet: () => Promise.reject(down),
      setSize: () => Promise.reject(down),
    };
    const onStoreError = vi.fn();
    const limiter = new RateLimiter(failing, () => MIDNIGHT, onStoreError);

    const decision = await limiter.consume(perMinute, 'a');
    expect(decision.allowed).toBe(true);
    if (decision.allowed) await decision.release();
    expect(onStoreError).toHaveBeenCalledTimes(1);
    expect(onStoreError).toHaveBeenCalledWith(down);
  });

  it('si solo falla release, avisa y no lanza', async () => {
    const down = new Error('sin Redis');
    const store: CounterStore = {
      increment: async () => 1,
      decrement: () => Promise.reject(down),
      addToCappedSet: async () => 'added',
      setSize: async () => 0,
    };
    const onStoreError = vi.fn();
    const decision = await new RateLimiter(store, () => MIDNIGHT, onStoreError).consume(
      perMinute,
      'a',
    );
    if (!decision.allowed) throw new Error('Debía pasar.');
    await expect(decision.release()).resolves.toBeUndefined();
    expect(onStoreError).toHaveBeenCalledWith(down);
  });
});

describe('loginSubject', () => {
  it('una IPv4 es su propio sujeto; una IPv4 mapeada en IPv6 cuenta como la IPv4', () => {
    expect(loginSubject('203.0.113.7')).toBe('203.0.113.7');
    expect(loginSubject('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('una IPv6 se agrupa por su prefijo /64', () => {
    expect(loginSubject('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(loginSubject('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(loginSubject('2001:0db8:0000:0002::9')).toBe('2001:db8:0:2::/64');
    expect(loginSubject('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(loginSubject('::1')).toBe('0:0:0:0::/64');
    expect(loginSubject('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });
});

describe('TradingRateLimits', () => {
  const config = {
    loginFailuresPer15Min: 2,
    loginFailuresPerDevicePer15Min: 100,
    ordersPerMinute: 2,
    ordersPerDay: 3,
  };
  let devices = 0;
  /** Un dispositivo nuevo en cada intento: aquí se prueba el techo por IP. */
  const fresh = () => `dispositivo-${(devices += 1)}`;

  it('login: solo quedan contados los fallidos; agotados, 429 con Retry-After', async () => {
    const { limiter, advance } = clockedLimiter();
    const limits = new TradingRateLimits(limiter, config);
    // Los exitosos devuelven su cupo.
    for (let i = 0; i < 5; i += 1)
      await (await limits.startLogin('10.0.0.1', fresh())).succeeded('cuenta');
    // Dos fallidos: el intento entra y nunca llama a succeeded().
    await limits.startLogin('10.0.0.1', fresh());
    await limits.startLogin('10.0.0.1', fresh());
    advance(MINUTE);

    const error = await rejection(limits.startLogin('10.0.0.1', fresh()));
    expect(error).toMatchObject({
      code: 'rate_limited',
      statusCode: 429,
      headers: { 'retry-after': String((LOGIN_FAILURE_WINDOW_MS - MINUTE) / 1000) },
    });
    await expect(limits.startLogin('10.0.0.2', fresh())).resolves.toBeDefined();

    advance(LOGIN_FAILURE_WINDOW_MS);
    await expect(limits.startLogin('10.0.0.1', fresh())).resolves.toBeDefined();
  });

  it('login: las direcciones de una misma /64 comparten el límite', async () => {
    const { limiter } = clockedLimiter();
    const limits = new TradingRateLimits(limiter, config);
    await limits.startLogin('2001:db8:1:2::a', fresh());
    await limits.startLogin('2001:db8:1:2::b', fresh());
    await expect(rejection(limits.startLogin('2001:db8:1:2::c', fresh()))).resolves.toMatchObject({
      code: 'rate_limited',
    });
    await expect(limits.startLogin('2001:db8:1:3::a', fresh())).resolves.toBeDefined();
  });

  it('órdenes: niega por minuto y luego por día, hasta la medianoche UTC', async () => {
    const { limiter, advance } = clockedLimiter();
    const limits = new TradingRateLimits(limiter, config);
    await limits.consumeOrder('cuenta');
    await limits.consumeOrder('cuenta');
    const perMinuteError = await rejection(limits.consumeOrder('cuenta'));
    expect(perMinuteError).toMatchObject({
      code: 'rate_limited',
      headers: { 'retry-after': '60' },
    });

    // La petición negada por minuto no gasta el cupo del día: van 2 de 3.
    advance(MINUTE);
    await limits.consumeOrder('cuenta');
    const perDayError = await rejection(limits.consumeOrder('cuenta'));
    expect(perDayError.message).toMatch(/máximo de órdenes del día/);
    expect(perDayError.headers['retry-after']).toBe(String((DAY - MINUTE) / 1000));

    advance(DAY);
    await expect(limits.consumeOrder('cuenta')).resolves.toBeUndefined();
  });
});

describe('TradingRateLimits: login por dispositivo y techo por IP (Gerente, 2026-11-24 y 2026-11-25)', () => {
  const config = {
    loginFailuresPer15Min: 20,
    loginFailuresPerDevicePer15Min: 10,
    ordersPerMinute: 30,
    ordersPerDay: 1000,
  };
  const IP = '198.51.100.7';

  function setup() {
    const { limiter, advance } = clockedLimiter();
    return { limits: new TradingRateLimits(limiter, config), advance };
  }

  /** `count` intentos fallidos del dispositivo: entran y nunca llaman a `succeeded()`. */
  async function fail(limits: TradingRateLimits, device: string, count: number, ip = IP) {
    for (let i = 0; i < count; i += 1) await limits.startLogin(ip, device);
  }

  /** Agota el techo de la IP con dispositivos nuevos, 5 fallos cada uno. */
  async function exhaustIp(limits: TradingRateLimits, ip = IP) {
    for (let i = 0; i < config.loginFailuresPer15Min / 5; i += 1)
      await fail(limits, `relleno-${i}`, 5, ip);
  }

  it('un dispositivo con 10 fallos se bloquea; otro de la misma IP sigue entrando', async () => {
    const { limits } = setup();
    await fail(limits, 'a', 10);
    await expect(rejection(limits.startLogin(IP, 'a'))).resolves.toMatchObject({
      code: 'rate_limited',
      statusCode: 429,
    });
    await expect(limits.startLogin(IP, 'b')).resolves.toBeDefined();
  });

  it('con el techo de la IP agotado, un dispositivo conocido entra y uno nuevo no', async () => {
    const { limits } = setup();
    await (await limits.startLogin(IP, 'conocido')).succeeded('cuenta');
    await exhaustIp(limits);
    await expect(limits.startLogin(IP, 'conocido')).resolves.toBeDefined();
    await expect(rejection(limits.startLogin(IP, 'nuevo'))).resolves.toMatchObject({
      code: 'rate_limited',
    });
    // El 429 del techo no cuenta contra el dispositivo: no llegó a probar un código.
    for (let i = 0; i < 20; i += 1) await rejection(limits.startLogin(IP, 'nuevo'));
    await expect(limits.startLogin('203.0.113.9', 'nuevo')).resolves.toBeDefined();
  });

  it('un dispositivo conocido que acumula 10 fallos sí se bloquea', async () => {
    const { limits } = setup();
    await (await limits.startLogin(IP, 'conocido')).succeeded('cuenta');
    await exhaustIp(limits);
    await fail(limits, 'conocido', 10);
    await expect(rejection(limits.startLogin(IP, 'conocido'))).resolves.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('G-A: 5 dispositivos conocidos por cuenta; el sexto entra pero no queda conocido', async () => {
    const { limits } = setup();
    // El primero entra dos veces: ocupa un solo lugar.
    for (const device of ['d1', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6']) {
      await (await limits.startLogin(IP, device)).succeeded('cuenta');
    }
    await exhaustIp(limits);
    for (const device of ['d1', 'd2', 'd3', 'd4', 'd5']) {
      await expect(limits.startLogin(IP, device)).resolves.toBeDefined();
    }
    await expect(rejection(limits.startLogin(IP, 'd6'))).resolves.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('G-A: el tope vale 30 días; después la cuenta puede marcar dispositivos nuevos', async () => {
    let now = MIDNIGHT;
    const limiter = new RateLimiter(
      new MemoryCounterStore(() => now),
      () => now,
      () => {},
    );
    const limits = new TradingRateLimits(limiter, config);
    for (const device of ['d1', 'd2', 'd3', 'd4', 'd5', 'd6']) {
      await (await limits.startLogin(IP, device)).succeeded('cuenta');
    }
    now += 30 * DAY;
    await (await limits.startLogin(IP, 'd6')).succeeded('cuenta');
    await exhaustIp(limits);
    await expect(limits.startLogin(IP, 'd6')).resolves.toBeDefined();
  });

  it('G-B: avisa una sola vez por ventana cuando la IP pasa del 50 % del techo', async () => {
    const { limits, advance } = setup();
    const flags: boolean[] = [];
    for (let i = 0; i < 14; i += 1) {
      flags.push((await limits.startLogin(IP, `d-${i}`)).ipPassedHalfCeiling);
    }
    // Techo 20: el 11.º intento pasa del 50 %; el aviso sale ahí y no se repite.
    expect(flags.indexOf(true)).toBe(10);
    expect(flags.filter(Boolean)).toHaveLength(1);
    advance(LOGIN_FAILURE_WINDOW_MS);
    for (let i = 0; i < 10; i += 1) await limits.startLogin(IP, `e-${i}`);
    expect((await limits.startLogin(IP, 'e-10')).ipPassedHalfCeiling).toBe(true);
  });

  it('lista negra: una sesión revocada lo queda hasta su vencimiento, y sin Redis se acepta', async () => {
    let now = MIDNIGHT;
    const limiter = new RateLimiter(
      new MemoryCounterStore(() => now),
      () => now,
      () => {},
    );
    const limits = new TradingRateLimits(limiter, config);
    await limits.revokeSession('huella', now + MINUTE);
    expect(await limits.isSessionRevoked('huella')).toBe(true);
    expect(await limits.isSessionRevoked('otra')).toBe(false);
    now += MINUTE;
    expect(await limits.isSessionRevoked('huella')).toBe(false);

    const down = new Error('sin Redis');
    const onStoreError = vi.fn();
    const broken = new TradingRateLimits(
      new RateLimiter(
        {
          increment: () => Promise.reject(down),
          decrement: () => Promise.reject(down),
          addToCappedSet: () => Promise.reject(down),
          setSize: () => Promise.reject(down),
        },
        () => now,
        onStoreError,
      ),
      config,
    );
    expect(await broken.isSessionRevoked('huella')).toBe(false);
    expect(onStoreError).toHaveBeenCalledWith(down);
  });
});
