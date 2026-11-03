import { describe, expect, it } from 'vitest';
import { profileFromRow, profileToData, speakerProfileInputSchema, type SpeakerProfileRow } from './profileService.js';

const NOW = new Date('2026-11-03T12:00:00Z');

function row(overrides: Partial<SpeakerProfileRow> = {}): SpeakerProfileRow {
  return {
    id: 'profile-1',
    userId: 'user-1',
    topics: '["healthcare","devops"]',
    bio: 'I talk about hospitals and pipelines.',
    seniority: 'keynote',
    homeCity: 'Denver',
    homeCountry: 'United States',
    travelRadius: 'country',
    remotePreference: 'prefer_remote',
    compensationRequirement: 'travel_covered',
    preferredFormats: '["conference","podcast"]',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('speakerProfileInputSchema', () => {
  it('accepts a full profile and trims, lowercases and dedupes the topics', () => {
    const parsed = speakerProfileInputSchema.parse({
      topics: [' Healthcare ', 'devops', 'healthcare', ''],
      bio: '  Hi  ',
      seniority: 'new',
      homeCity: '  Denver ',
      homeCountry: '',
      travelRadius: 'local',
      remotePreference: 'remote_only',
      compensationRequirement: 'paid',
      preferredFormats: ['podcast', 'podcast', 'conference'],
    });
    expect(parsed).toEqual({
      topics: ['healthcare', 'devops'],
      bio: 'Hi',
      seniority: 'new',
      homeCity: 'Denver',
      homeCountry: null,
      travelRadius: 'local',
      remotePreference: 'remote_only',
      compensationRequirement: 'paid',
      preferredFormats: ['podcast', 'conference'],
    });
  });

  it('fills defaults for an almost empty body', () => {
    expect(speakerProfileInputSchema.parse({})).toEqual({
      topics: [],
      bio: '',
      seniority: 'experienced',
      homeCity: null,
      homeCountry: null,
      travelRadius: 'international',
      remotePreference: 'either',
      compensationRequirement: 'any',
      preferredFormats: [],
    });
  });

  it('rejects unknown enum values, oversized fields and non-string topics', () => {
    expect(speakerProfileInputSchema.safeParse({ seniority: 'legend' }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ preferredFormats: ['banquet'] }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ topics: [42] }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ topics: ['x'.repeat(41)] }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ topics: Array.from({ length: 31 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ bio: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('profileFromRow', () => {
  it('parses the JSON columns and keeps the enums', () => {
    expect(profileFromRow(row())).toEqual({
      id: 'profile-1',
      userId: 'user-1',
      topics: ['healthcare', 'devops'],
      bio: 'I talk about hospitals and pipelines.',
      seniority: 'keynote',
      homeCity: 'Denver',
      homeCountry: 'United States',
      travelRadius: 'country',
      remotePreference: 'prefer_remote',
      compensationRequirement: 'travel_covered',
      preferredFormats: ['conference', 'podcast'],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('falls back to defaults for malformed JSON and unknown enum strings', () => {
    const parsed = profileFromRow(
      row({
        topics: 'not json',
        preferredFormats: '["conference","banquet"]',
        seniority: 'legend',
        travelRadius: 'galaxy',
        remotePreference: 'maybe',
        compensationRequirement: 'crypto',
      })
    );
    expect(parsed.topics).toEqual([]);
    expect(parsed.preferredFormats).toEqual(['conference']);
    expect(parsed.seniority).toBe('experienced');
    expect(parsed.travelRadius).toBe('international');
    expect(parsed.remotePreference).toBe('either');
    expect(parsed.compensationRequirement).toBe('any');
  });
});

describe('profileToData', () => {
  it('serializes the arrays as JSON strings for the row', () => {
    const data = profileToData(speakerProfileInputSchema.parse({ topics: ['ai'], preferredFormats: ['meetup'] }));
    expect(data.topics).toBe('["ai"]');
    expect(data.preferredFormats).toBe('["meetup"]');
    expect(data.homeCity).toBeNull();
    expect(data.seniority).toBe('experienced');
  });
});
