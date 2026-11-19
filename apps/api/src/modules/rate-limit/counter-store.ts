import type { CounterStore } from './rate-limiter.js';

/**
 * Suma 1 y, si la llave es nueva, le pone vencimiento al fin de la ventana. Es un solo viaje y
 * es atómico: dos peticiones simultáneas nunca dejan una llave sin vencimiento.
 */
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIREAT', KEYS[1], ARGV[1]) end
return count
`;

/** Resta 1 solo si la llave existe: un `DECR` sobre una llave vencida la crearía sin vencimiento. */
const DECREMENT_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('DECR', KEYS[1]) end
return 0
`;

/** Lo mínimo que este almacén necesita de un cliente de Redis (ioredis). */
export type RedisCounterClient = {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
};

/** Contadores en Redis. Sirven aunque la API corra en más de un proceso. */
export class RedisCounterStore implements CounterStore {
  constructor(private readonly redis: RedisCounterClient) {}

  async increment(key: string, expiresAtMs: number): Promise<number> {
    return Number(await this.redis.eval(INCREMENT_SCRIPT, 1, key, expiresAtMs));
  }

  async decrement(key: string): Promise<void> {
    await this.redis.eval(DECREMENT_SCRIPT, 1, key);
  }
}

/**
 * Contadores en memoria, para tests. Cada llave incluye el inicio de su ventana, así que una
 * ventana nueva usa una llave nueva y no hace falta vencer las viejas.
 */
export class MemoryCounterStore implements CounterStore {
  private readonly counts = new Map<string, number>();

  async increment(key: string): Promise<number> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return count;
  }

  async decrement(key: string): Promise<void> {
    const count = this.counts.get(key);
    if (count !== undefined) this.counts.set(key, count - 1);
  }
}
