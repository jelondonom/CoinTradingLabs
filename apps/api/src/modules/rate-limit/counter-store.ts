import type { CappedSetResult, CounterStore } from './rate-limiter.js';

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

/**
 * Agrega al conjunto si no está y cabe, de forma atómica. Devuelve 0 si lo agregó, 1 si ya estaba
 * y 2 si el conjunto está lleno. Solo un conjunto nuevo recibe vencimiento.
 */
const ADD_TO_CAPPED_SET_SCRIPT = `
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then return 1 end
if redis.call('SCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 2 end
local isNew = redis.call('EXISTS', KEYS[1]) == 0
redis.call('SADD', KEYS[1], ARGV[1])
if isNew then redis.call('PEXPIREAT', KEYS[1], ARGV[3]) end
return 0
`;

const CAPPED_SET_RESULTS: readonly CappedSetResult[] = ['added', 'present', 'full'];

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

  async addToCappedSet(
    key: string,
    member: string,
    maxSize: number,
    expiresAtMs: number,
  ): Promise<CappedSetResult> {
    const code = Number(
      await this.redis.eval(ADD_TO_CAPPED_SET_SCRIPT, 1, key, member, maxSize, expiresAtMs),
    );
    const result = CAPPED_SET_RESULTS[code];
    if (!result) throw new Error(`Respuesta inesperada de Redis: ${code}`);
    return result;
  }

  async setSize(key: string): Promise<number> {
    return Number(await this.redis.eval("return redis.call('SCARD', KEYS[1])", 1, key));
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

  private readonly sets = new Map<string, { members: Set<string>; expiresAtMs: number }>();

  /**
   * `now` permite vencer los conjuntos en tests con reloj falso. Sin él, los conjuntos no vencen
   * (como los contadores, que ya traen su ventana en la llave).
   */
  constructor(private readonly now?: () => number) {}

  async addToCappedSet(
    key: string,
    member: string,
    maxSize: number,
    expiresAtMs: number,
  ): Promise<CappedSetResult> {
    const set = this.liveSet(key) ?? { members: new Set<string>(), expiresAtMs };
    if (set.members.has(member)) return 'present';
    if (set.members.size >= maxSize) return 'full';
    set.members.add(member);
    this.sets.set(key, set);
    return 'added';
  }

  async setSize(key: string): Promise<number> {
    return this.liveSet(key)?.members.size ?? 0;
  }

  private liveSet(key: string) {
    const set = this.sets.get(key);
    if (!set) return undefined;
    if (this.now && this.now() >= set.expiresAtMs) {
      this.sets.delete(key);
      return undefined;
    }
    return set;
  }
}
