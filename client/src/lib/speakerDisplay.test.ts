import { describe, expect, it } from 'vitest';
import { speakerName, speakerReach, topicsPreview } from './speakerDisplay';

const placed = (overrides: Partial<Parameters<typeof speakerReach>[0]> = {}) => ({
  homeCity: 'Lagos',
  homeCountry: 'Nigeria',
  travelRadius: 'international' as const,
  remotePreference: 'either' as const,
  ...overrides,
});

describe('speakerName', () => {
  it('is the name, trimmed', () => {
    expect(speakerName({ name: ' Dana Okafor ' })).toBe('Dana Okafor');
  });

  it('says so when a profile from before the roster has none', () => {
    expect(speakerName({ name: '' })).toBe('Unnamed speaker');
    expect(speakerName({ name: '   ' })).toBe('Unnamed speaker');
  });
});

describe('speakerReach', () => {
  it('gives the home and how far the speaker travels', () => {
    expect(speakerReach(placed())).toBe('Lagos, Nigeria. Travels anywhere');
    expect(speakerReach(placed({ travelRadius: 'country', homeCity: null }))).toBe('Nigeria. Home country only');
    expect(speakerReach(placed({ travelRadius: 'local' }))).toBe('Lagos, Nigeria. Home city only');
  });

  it('leaves the home out when none was given', () => {
    expect(speakerReach(placed({ homeCity: null, homeCountry: null }))).toBe('Travels anywhere');
  });

  it('puts remote only in place of travel, and adds a preference for remote to it', () => {
    expect(speakerReach(placed({ remotePreference: 'remote_only' }))).toBe('Lagos, Nigeria. Remote only');
    expect(speakerReach(placed({ remotePreference: 'prefer_remote', travelRadius: 'country' }))).toBe(
      'Lagos, Nigeria. Home country only, prefers remote'
    );
    expect(speakerReach(placed({ remotePreference: 'prefer_in_person' }))).toBe('Lagos, Nigeria. Travels anywhere');
  });
});

describe('topicsPreview', () => {
  it('shows what fits and counts the rest', () => {
    expect(topicsPreview(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ shown: ['a', 'b', 'c', 'd'], more: 2 });
    expect(topicsPreview(['a'])).toEqual({ shown: ['a'], more: 0 });
    expect(topicsPreview([])).toEqual({ shown: [], more: 0 });
  });
});
