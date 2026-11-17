import type { Env } from '../env.js';
import { BinanceFeedAdapter, type FeedLogger } from './binance.js';
import type { FeedAdapter } from './feed-adapter.js';
import { MockFeedAdapter } from './mock.js';

type FeedEnv = Pick<
  Env,
  'feed' | 'mockFeedSeed' | 'tickIntervalMs' | 'binanceSpotWsUrl' | 'binanceFuturesWsUrl'
>;

/** Construye el feed que indica la configuración. */
export function createFeed(env: FeedEnv, logger?: FeedLogger): FeedAdapter {
  switch (env.feed) {
    case 'mock':
      return new MockFeedAdapter({
        intervalMs: env.tickIntervalMs,
        ...(env.mockFeedSeed === undefined ? {} : { seed: env.mockFeedSeed }),
      });
    case 'live':
      return new BinanceFeedAdapter({
        spotUrl: env.binanceSpotWsUrl,
        futuresUrl: env.binanceFuturesWsUrl,
        ...(logger ? { logger } : {}),
      });
  }
}
