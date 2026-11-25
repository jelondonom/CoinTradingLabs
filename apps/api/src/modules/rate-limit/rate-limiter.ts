import { isIPv6 } from 'node:net';
import { rateLimited } from '../../errors/app-error.js';

/** Regla de ventana fija: como máximo `limit` eventos por sujeto en cada ventana de `windowMs`. */
export type RateLimitRule = { name: string; limit: number; windowMs: number };

export type RateLimitDecision =
  /**
   * `release` descuenta el evento de su ventana (por ejemplo, un login que salió bien). `count` es
   * el valor del contador con este evento y `windowEndsAt`, el fin de su ventana.
   */
  | { allowed: true; count: number; windowEndsAt: number; release: () => Promise<void> }
  | { allowed: false; retryAfterMs: number };

/** Resultado de agregar a un conjunto con tope. */
export type CappedSetResult = 'added' | 'present' | 'full';

/** Contadores y conjuntos por llave. Cada llave vence en el momento que se le fija al crearla. */
export interface CounterStore {
  /** Suma 1 al contador de `key` y devuelve el valor nuevo. La llave vence en `expiresAtMs`. */
  increment(key: string, expiresAtMs: number): Promise<number>;
  /** Resta 1 al contador de `key` si la llave todavía existe; si ya venció, no hace nada. */
  decrement(key: string): Promise<void>;
  /**
   * Agrega `member` al conjunto de `key` si no está y el conjunto tiene menos de `maxSize`
   * miembros, de forma atómica. Un conjunto nuevo vence en `expiresAtMs`; agregar no lo renueva.
   */
  addToCappedSet(
    key: string,
    member: string,
    maxSize: number,
    expiresAtMs: number,
  ): Promise<CappedSetResult>;
  /** Cantidad de miembros del conjunto de `key`; 0 si no existe o ya venció. */
  setSize(key: string): Promise<number>;
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
      return { allowed: true, count, windowEndsAt: endsAt, release: () => this.release(key) };
    } catch (error) {
      this.onStoreError(error);
      return { allowed: true, count: 0, windowEndsAt: endsAt, release: async () => {} };
    }
  }

  /** Hora del limitador, en milisegundos desde epoch. */
  nowMs(): number {
    return this.now();
  }

  /** `addToCappedSet` del almacén. Si el almacén falla, avisa y devuelve `null`. */
  async addToCappedSet(
    key: string,
    member: string,
    maxSize: number,
    expiresAtMs: number,
  ): Promise<CappedSetResult | null> {
    try {
      return await this.store.addToCappedSet(key, member, maxSize, expiresAtMs);
    } catch (error) {
      this.onStoreError(error);
      return null;
    }
  }

  /** `setSize` del almacén. Si el almacén falla, avisa y devuelve 0 (deja pasar). */
  async setSize(key: string): Promise<number> {
    try {
      return await this.store.setSize(key);
    } catch (error) {
      this.onStoreError(error);
      return 0;
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

/** Dispositivos conocidos por cuenta en cada ventana de 30 días (G-A, Gerente, 2026-11-25). */
export const KNOWN_DEVICES_PER_ACCOUNT = 5;
export const KNOWN_DEVICE_WINDOW_MS = 30 * DAY_MS;

/** Números de D-13. Los propone el Backend y los valida QA (`docs/engine-rules.md` §11). */
export type RateLimitConfig = {
  /** Techo de intentos fallidos de login por IP en cada ventana de 15 minutos. */
  loginFailuresPer15Min: number;
  /** Intentos fallidos de login por dispositivo (`coin_device`) en cada ventana de 15 minutos. */
  loginFailuresPerDevicePer15Min: number;
  /** Peticiones a `POST /orders` por cuenta en cada minuto. */
  ordersPerMinute: number;
  /** Peticiones a `POST /orders` por cuenta en cada día UTC. */
  ordersPerDay: number;
};

/** Intento de login en curso. */
export type LoginAttempt = {
  /**
   * El login salió bien: descuenta el intento de los dos límites y marca el dispositivo como
   * conocido para la cuenta, si cabe en su tope (G-A).
   */
  succeeded: (accountId: string) => Promise<void>;
  /**
   * `true` solo la primera vez en la ventana que la IP pasa del 50 % de su techo (G-B): la ruta
   * deja un `warn` en el log y el Arquitecto alerta sobre él.
   */
  ipPassedHalfCeiling: boolean;
};

/** Límites de peticiones de las rutas de trading (D-13). */
export class TradingRateLimits {
  private readonly loginFailures: RateLimitRule;
  private readonly deviceFailures: RateLimitRule;
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
    this.deviceFailures = {
      name: 'login-device',
      limit: config.loginFailuresPerDevicePer15Min,
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
   * Cuenta un intento de login del dispositivo y de su IP, y lanza 429 si no cabe. El intento
   * cuenta desde que entra, así una ráfaga simultánea no se salta el límite; si sale bien,
   * `succeeded()` lo descuenta. Por eso solo quedan contados los fallidos. Un login exitoso no
   * reinicia los contadores: si lo hiciera, se podría alternar un código válido con intentos al
   * azar.
   *
   * - Dispositivo (`coin_device`): su propio límite. Aplica siempre, también a uno conocido.
   * - IP: un techo alto, para que cientos de asistentes detrás del Wi-Fi del evento no se bloqueen
   *   entre sí. Con el techo agotado, un dispositivo conocido (que ya entró con un código válido)
   *   sigue pudiendo entrar; uno nuevo recibe 429, aunque traiga un código válido.
   */
  async startLogin(ip: string, deviceId: string): Promise<LoginAttempt> {
    const device = await this.limiter.consume(this.deviceFailures, deviceId);
    assertAllowed(device, 'Demasiados intentos de ingreso fallidos desde este dispositivo.');

    const subject = loginSubject(ip);
    const ipDecision = await this.limiter.consume(this.loginFailures, subject);
    if (!ipDecision.allowed && !(await this.isKnownDevice(deviceId))) {
      // No llegó a probar un código: no cuenta contra el dispositivo.
      await device.release();
      assertAllowed(ipDecision, 'Demasiados intentos de ingreso fallidos desde esta red.');
    }

    return {
      ipPassedHalfCeiling: ipDecision.allowed
        ? await this.firstTimePastHalf(subject, ipDecision)
        : false,
      succeeded: async (accountId) => {
        await device.release();
        if (ipDecision.allowed) await ipDecision.release();
        await this.markKnown(deviceId, accountId);
      },
    };
  }

  /**
   * Lista negra de sesiones (G2): al cerrar sesión, el token queda revocado hasta su vencimiento.
   * Vive aquí porque usa el mismo almacén de Redis que los límites. Si Redis falla, la sesión
   * se acepta (falla abierto, como D-13) y queda un aviso en el log.
   */
  async revokeSession(tokenHash: string, expiresAtMs: number): Promise<void> {
    if (expiresAtMs <= this.limiter.nowMs()) return;
    await this.limiter.addToCappedSet(revokedKey(tokenHash), '1', 1, expiresAtMs);
  }

  async isSessionRevoked(tokenHash: string): Promise<boolean> {
    return (await this.limiter.setSize(revokedKey(tokenHash))) > 0;
  }

  /** `true` si el dispositivo entró con un código válido en los últimos 30 días. */
  private async isKnownDevice(deviceId: string): Promise<boolean> {
    return (await this.limiter.setSize(knownDeviceKey(deviceId))) > 0;
  }

  /**
   * G-A: como máximo `KNOWN_DEVICES_PER_ACCOUNT` dispositivos distintos por cuenta en 30 días.
   * Varios ingresos desde el mismo dispositivo ocupan un solo lugar. Con el tope lleno, el
   * dispositivo entra igual pero no queda como conocido; no se expulsa al más antiguo.
   */
  private async markKnown(deviceId: string, accountId: string): Promise<void> {
    const expiresAt = this.limiter.nowMs() + KNOWN_DEVICE_WINDOW_MS;
    const slot = await this.limiter.addToCappedSet(
      `kd:acc:${accountId}`,
      deviceId,
      KNOWN_DEVICES_PER_ACCOUNT,
      expiresAt,
    );
    if (slot !== 'added' && slot !== 'present') return;
    // El tope real lo pone el conjunto de la cuenta; este solo responde "¿es conocido?".
    await this.limiter.addToCappedSet(
      knownDeviceKey(deviceId),
      accountId,
      Number.MAX_SAFE_INTEGER,
      expiresAt,
    );
  }

  /** G-B: `true` la primera vez en la ventana que la IP pasa del 50 % de su techo. */
  private async firstTimePastHalf(
    subject: string,
    decision: Extract<RateLimitDecision, { allowed: true }>,
  ): Promise<boolean> {
    if (decision.count * 2 <= this.loginFailures.limit) return false;
    const marker = await this.limiter.addToCappedSet(
      `rl-warn:login-ip:${subject}:${decision.windowEndsAt}`,
      '1',
      1,
      decision.windowEndsAt,
    );
    return marker === 'added';
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

function knownDeviceKey(deviceId: string): string {
  return `kd:dev:${deviceId}`;
}

function revokedKey(tokenHash: string): string {
  return `revoked:${tokenHash}`;
}

function assertAllowed(
  decision: RateLimitDecision,
  message: string,
): asserts decision is Extract<RateLimitDecision, { allowed: true }> {
  if (decision.allowed) return;
  const seconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
  throw rateLimited(`${message} Intenta de nuevo en ${seconds} s.`, seconds);
}
