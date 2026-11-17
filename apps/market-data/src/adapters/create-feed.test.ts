import { describe, expect, it } from 'vitest';
import { loadEnv } from '../env.js';
import { BinanceFeedAdapter } from './binance.js';
import { createFeed } from './create-feed.js';
import { MockFeedAdapter } from './mock.js';

describe('createFeed', () => {
  it('construye el feed simulado', () => {
    const feed = createFeed(loadEnv({}));
    expect(feed).toBeInstanceOf(MockFeedAdapter);
    expect(feed.simulated).toBe(true);
  });

  it('construye el feed real de Binance sin abrir conexiones', () => {
    const feed = createFeed(loadEnv({ FEED: 'live' }));
    expect(feed).toBeInstanceOf(BinanceFeedAdapter);
    expect(feed.simulated).toBe(false);
  });
});
