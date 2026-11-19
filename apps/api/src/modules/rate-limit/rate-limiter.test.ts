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
  const config = { loginFailuresPer15Min: 2, ordersPerMinute: 2, ordersPerDay: 3 };

  it('login: solo quedan contados los fallidos; agotados, 429 con Retry-After', async () => {
    const { limiter, advance } = clockedLimiter();
    const limits = new TradingRateLimits(limiter, config);
    // Los exitosos devuelven su cupo.
    for (let i = 0; i < 5; i += 1) await (await limits.startLogin('10.0.0.1')).succeeded();
    // Dos fallidos: el intento entra y nunca llama a succeeded().
    await limits.startLogin('10.0.0.1');
    await limits.startLogin('10.0.0.1');
    advance(MINUTE);

    const error = await rejection(limits.startLogin('10.0.0.1'));
    expect(error).toMatchObject({
      code: 'rate_limited',
      statusCode: 429,
      headers: { 'retry-after': String((LOGIN_FAILURE_WINDOW_MS - MINUTE) / 1000) },
    });
    await expect(limits.startLogin('10.0.0.2')).resolves.toBeDefined();

    advance(LOGIN_FAILURE_WINDOW_MS);
    await expect(limits.startLogin('10.0.0.1')).resolves.toBeDefined();
  });

  it('login: las direcciones de una misma /64 comparten el límite', async () => {
    const { limiter } = clockedLimiter();
    const limits = new TradingRateLimits(limiter, config);
    await limits.startLogin('2001:db8:1:2::a');
    await limits.startLogin('2001:db8:1:2::b');
    await expect(rejection(limits.startLogin('2001:db8:1:2::c'))).resolves.toMatchObject({
      code: 'rate_limited',
    });
    await expect(limits.startLogin('2001:db8:1:3::a')).resolves.toBeDefined();
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
