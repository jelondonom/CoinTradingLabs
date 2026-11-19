import { isIPv6 } from 'node:net';
import { rateLimited } from '../../errors/app-error.js';

/** Regla de ventana fija: como máximo `limit` eventos por sujeto en cada ventana de `windowMs`. */
export type RateLimitRule = { name: string; limit: number; windowMs: number };

export type RateLimitDecision =
  /** `release` descuenta el evento de su ventana (por ejemplo, un login que salió bien). */
  { allowed: true; release: () => Promise<void> } | { allowed: false; retryAfterMs: number };

/** Contadores por llave. Cada llave vence al terminar su ventana. */
export interface CounterStore {
  /** Suma 1 al contador de `key` y devuelve el valor nuevo. La llave vence en `expiresAtMs`. */
  increment(key: string, expiresAtMs: number): Promise<number>;
  /** Resta 1 al contador de `key` si la llave todavía existe; si ya venció, no hace nada. */
  decrement(key: string): Promise<void>;
}

/**
 * Limitador de ventana fija (D-13). La ventana es `floor(ahora / windowMs)`, así que una ventana
 * de un día va de medianoche a medianoche UTC. Recibe la hora inyectada, como el motor.
 * Si el almacén falla, deja pasar (fail-open) y avisa con `onStoreError`: sin Redis tampoco hay
 * precios, así que una orden igual se rechaza con `no_price`.
 */
export class RateLimiter {
  constructor(
    private readonly store: CounterStore,
    private readonly now: () => number,
    private readonly onStoreError: (error: unknown) => void,
  ) {}

  /**
   * Cuenta un evento y decide si cabe en la regla. El conteo es atómico: una ráfaga de peticiones
   * simultáneas nunca pasa del límite.
   */
  async consume(rule: RateLimitRule, subject: string): Promise<RateLimitDecision> {
    const now = this.now();
    const startsAt = Math.floor(now / rule.windowMs) * rule.windowMs;
    const endsAt = startsAt + rule.windowMs;
    const key = `rl:${rule.name}:${subject}:${startsAt}`;
    try {
      const count = await this.store.increment(key, endsAt);
      if (count > rule.limit) return { allowed: false, retryAfterMs: endsAt - now };
      return { allowed: true, release: () => this.release(key) };
    } catch (error) {
      this.onStoreError(error);
      return { allowed: true, release: async () => {} };
    }
  }

  private async release(key: string): Promise<void> {
    try {
      await this.store.decrement(key);
    } catch (error) {
      this.onStoreError(error);
    }
  }
}

/**
 * Sujeto del límite de login. Una IPv6 se agrupa por su prefijo /64: quien controla una /64 tiene
 * 2^64 direcciones y podría estrenar una en cada intento. Una IPv4 mapeada (`::ffff:a.b.c.d`)
 * cuenta como esa IPv4.
 */
export function loginSubject(ip: string): string {
  const address = ip.split('%')[0] ?? ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped?.[1]) return mapped[1];
  if (!isIPv6(address)) return address;

  const [head = '', tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Ventana de los intentos de login. */
export const LOGIN_FAILURE_WINDOW_MS = 15 * MINUTE_MS;

/** Números de D-13. Los propone el Backend y los valida QA (`docs/engine-rules.md` §11). */
export type RateLimitConfig = {
  /** Intentos fallidos de login por IP en cada ventana de 15 minutos. */
  loginFailuresPer15Min: number;
  /** Peticiones a `POST /orders` por cuenta en cada minuto. */
  ordersPerMinute: number;
  /** Peticiones a `POST /orders` por cuenta en cada día UTC. */
  ordersPerDay: number;
};

/** Intento de login en curso. Si sale bien, `succeeded()` lo descuenta del límite. */
export type LoginAttempt = { succeeded: () => Promise<void> };

/** Límites de peticiones de las rutas de trading (D-13). */
export class TradingRateLimits {
  private readonly loginFailures: RateLimitRule;
  private readonly ordersPerMinute: RateLimitRule;
  private readonly ordersPerDay: RateLimitRule;

  constructor(
    private readonly limiter: RateLimiter,
    config: RateLimitConfig,
  ) {
    this.loginFailures = {
      name: 'login-fail',
      limit: config.loginFailuresPer15Min,
      windowMs: LOGIN_FAILURE_WINDOW_MS,
    };
    this.ordersPerMinute = {
      name: 'orders-min',
      limit: config.ordersPerMinute,
      windowMs: MINUTE_MS,
    };
    this.ordersPerDay = { name: 'orders-day', limit: config.ordersPerDay, windowMs: DAY_MS };
  }

  /**
   * Cuenta un intento de login de la IP y lanza 429 si pasa del límite, aunque traiga un código
   * válido: si no, el límite no frenaría a quien prueba códigos al azar. El intento cuenta desde
   * que entra, así una ráfaga simultánea no se salta el límite; si el login sale bien, se llama a
   * `succeeded()` y deja de contar. Por eso solo quedan contados los fallidos. Un login exitoso no
   * reinicia el contador: si lo hiciera, un participante podría alternar su código válido con
   * intentos al azar.
   */
  async startLogin(ip: string): Promise<LoginAttempt> {
    const decision = await this.limiter.consume(this.loginFailures, loginSubject(ip));
    assertAllowed(decision, 'Demasiados intentos de ingreso fallidos.');
    return { succeeded: decision.release };
  }

  /** Cuenta una petición de orden de la cuenta. Lanza 429 si pasa del límite por minuto o por día. */
  async consumeOrder(accountId: string): Promise<void> {
    assertAllowed(
      await this.limiter.consume(this.ordersPerMinute, accountId),
      'Demasiadas órdenes en poco tiempo.',
    );
    assertAllowed(
      await this.limiter.consume(this.ordersPerDay, accountId),
      'Llegaste al máximo de órdenes del día.',
    );
  }
}

function assertAllowed(
  decision: RateLimitDecision,
  message: string,
): asserts decision is Extract<RateLimitDecision, { allowed: true }> {
  if (decision.allowed) return;
  const seconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
  throw rateLimited(`${message} Intenta de nuevo en ${seconds} s.`, seconds);
}
