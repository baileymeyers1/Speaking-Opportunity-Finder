import { describe, expect, it } from 'vitest';
import { profileFromRow, profileToData, speakerProfileInputSchema, type SpeakerProfileRow } from './speakerService.js';

const NOW = new Date('2026-11-03T12:00:00Z');

function row(overrides: Partial<SpeakerProfileRow> = {}): SpeakerProfileRow {
  return {
    id: 'profile-1',
    userId: 'user-1',
    name: 'Dana Okafor',
    title: 'Chief medical officer',
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
      name: '  Dana Okafor ',
      title: ' CMO ',
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
      name: 'Dana Okafor',
      title: 'CMO',
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

  it('fills defaults for a body with only a name', () => {
    expect(speakerProfileInputSchema.parse({ name: 'Dana' })).toEqual({
      name: 'Dana',
      title: '',
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

  it('needs a name, and keeps the name and title to one line each', () => {
    expect(speakerProfileInputSchema.safeParse({}).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ name: 'Dana', title: 'x'.repeat(121) }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({}).error?.issues[0].message).toBe('Enter a name');
  });

  it('rejects unknown enum values, oversized fields and non-string topics', () => {
    expect(speakerProfileInputSchema.safeParse({ name: 'Dana', seniority: 'legend' }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ name: 'Dana', preferredFormats: ['banquet'] }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ name: 'Dana', topics: [42] }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ name: 'Dana', topics: ['x'.repeat(41)] }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ name: 'Dana', topics: Array.from({ length: 31 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(speakerProfileInputSchema.safeParse({ name: 'Dana', bio: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('profileFromRow', () => {
  it('parses the JSON columns and keeps the enums', () => {
    expect(profileFromRow(row())).toEqual({
      id: 'profile-1',
      userId: 'user-1',
      name: 'Dana Okafor',
      title: 'Chief medical officer',
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
    const data = profileToData(speakerProfileInputSchema.parse({ name: 'Dana', topics: ['ai'], preferredFormats: ['meetup'] }));
    expect(data.name).toBe('Dana');
    expect(data.title).toBe('');
    expect(data.topics).toBe('["ai"]');
    expect(data.preferredFormats).toBe('["meetup"]');
    expect(data.homeCity).toBeNull();
    expect(data.seniority).toBe('experienced');
  });
});
