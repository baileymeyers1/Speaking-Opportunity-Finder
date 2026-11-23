import { describe, expect, it } from 'vitest';
import { demoDatabaseUrl, demoListingsSource, demoLiveSearchDailyLimit, isDemoMode } from './env.js';

describe('demo env', () => {
  it('is on only for DEMO_MODE=true', () => {
    expect(isDemoMode({ DEMO_MODE: 'true' })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: '1' })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });

  it('uses the demo database, preferring the direct connection, and never DATABASE_URL', () => {
    expect(demoDatabaseUrl({ DATABASE_URL: 'postgresql://prod' })).toBeUndefined();
    expect(demoDatabaseUrl({ DEMO_DATABASE_URL: 'postgresql://pooled' })).toBe('postgresql://pooled');
    expect(
      demoDatabaseUrl({ DEMO_DATABASE_URL: 'postgresql://pooled', DEMO_DATABASE_URL_UNPOOLED: 'postgresql://direct' })
    ).toBe('postgresql://direct');
  });

  it('caps live searches at 25 a day unless told otherwise', () => {
    expect(demoLiveSearchDailyLimit({})).toBe(25);
    expect(demoLiveSearchDailyLimit({ DEMO_LIVE_SEARCH_DAILY_LIMIT: '10' })).toBe(10);
    expect(demoLiveSearchDailyLimit({ DEMO_LIVE_SEARCH_DAILY_LIMIT: '0' })).toBe(0);
    expect(demoLiveSearchDailyLimit({ DEMO_LIVE_SEARCH_DAILY_LIMIT: 'lots' })).toBe(25);
  });

  it('copies listings from production unless pointed elsewhere', () => {
    expect(demoListingsSource({})).toBe('https://speaking-opportunity-finder.vercel.app');
    expect(demoListingsSource({ DEMO_LISTINGS_SOURCE: 'http://localhost:3001/' })).toBe('http://localhost:3001');
  });
});
