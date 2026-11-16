import { SYMBOLS, tickSchema, type Tick } from '@coin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedStatus } from './feed-adapter.js';
import { MockFeedAdapter, seededRandom } from './mock.js';

function collect() {
  const ticks: Tick[] = [];
  const statuses: FeedStatus[] = [];
  return {
    ticks,
    statuses,
    handlers: {
      onTick: (tick: Tick) => ticks.push(tick),
      onStatus: (status: FeedStatus) => statuses.push(status),
    },
  };
}

describe('MockFeedAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('se declara simulado', () => {
    const feed = new MockFeedAdapter({ intervalMs: 1000 });
    expect(feed.name).toBe('mock');
    expect(feed.simulated).toBe(true);
  });

  it('emite un tick válido por símbolo al iniciar y en cada intervalo', async () => {
    const feed = new MockFeedAdapter({ intervalMs: 1000, now: () => 1_800_000_000_000 });
    const sink = collect();

    await feed.start(sink.handlers);
    expect(sink.statuses).toEqual(['connected']);
    expect(sink.ticks.map((tick) => tick.symbol)).toEqual([...SYMBOLS]);

    vi.advanceTimersByTime(3000);
    expect(sink.ticks).toHaveLength(SYMBOLS.length * 4);
    for (const tick of sink.ticks) {
      expect(tickSchema.safeParse(tick).success).toBe(true);
      expect(tick.ts).toBe(1_800_000_000_000);
    }
    await feed.stop();
  });

  it('solo emite los símbolos pedidos', async () => {
    const feed = new MockFeedAdapter({ intervalMs: 1000, symbols: ['BTCUSD', 'AAPL'] });
    const sink = collect();
    await feed.start(sink.handlers);
    expect(sink.ticks.map((tick) => tick.symbol)).toEqual(['BTCUSD', 'AAPL']);
    await feed.stop();
  });

  it('deja de emitir tras stop y avisa la desconexión', async () => {
    const feed = new MockFeedAdapter({ intervalMs: 1000 });
    const sink = collect();
    await feed.start(sink.handlers);
    await feed.stop();
    const emitted = sink.ticks.length;

    vi.advanceTimersByTime(5000);
    expect(sink.ticks).toHaveLength(emitted);
    expect(sink.statuses).toEqual(['connected', 'disconnected']);

    await feed.stop();
    expect(sink.statuses).toEqual(['connected', 'disconnected']);
  });

  it('rechaza un segundo start sin stop', async () => {
    const feed = new MockFeedAdapter({ intervalMs: 1000 });
    await feed.start(collect().handlers);
    await expect(feed.start(collect().handlers)).rejects.toThrow('ya está iniciado');
    await feed.stop();
  });

  it('con la misma semilla produce la misma secuencia de precios', async () => {
    const run = async (seed: number) => {
      const feed = new MockFeedAdapter({ intervalMs: 1000, seed, now: () => 1 });
      const sink = collect();
      await feed.start(sink.handlers);
      vi.advanceTimersByTime(5000);
      await feed.stop();
      return sink.ticks;
    };
    const first = await run(42);
    expect(await run(42)).toEqual(first);
    expect(await run(43)).not.toEqual(first);
  });
});

describe('seededRandom', () => {
  it('devuelve valores en [0, 1)', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
