import { describe, it, expect } from 'vitest';
import { buildFilters, liveSearchTopics, requestedSectors } from './opportunityFilters.js';

describe('buildFilters: sectors', () => {
  it('reads one or several sector ids', () => {
    expect(buildFilters({ sectors: 'healthcare' }).sectors).toEqual(['healthcare']);
    expect(buildFilters({ sectors: ['healthcare', 'finance'] }).sectors).toEqual(['healthcare', 'finance']);
  });

  it('drops ids that are not on the list and repeats', () => {
    expect(buildFilters({ sectors: ['healthcare', 'Healthcare', 'bogus', 'healthcare'] }).sectors).toEqual(['healthcare']);
    expect(buildFilters({ sectors: 'bogus' }).sectors).toBeUndefined();
    expect(buildFilters({}).sectors).toBeUndefined();
  });

  it('maps the free-text industries of an old link or saved search to sectors', () => {
    expect(buildFilters({ industries: 'devops' }).sectors).toEqual(['cloud-devops']);
    expect(buildFilters({ industries: ['artificial intelligence', 'machine-learning', 'ai'] }).sectors).toEqual(['ai']);
    expect(buildFilters({ industries: ['technology', 'healthcare'] }).sectors).toEqual(['software', 'healthcare']);
  });

  it('ignores an old industry no sector matches', () => {
    expect(buildFilters({ industries: 'community' }).sectors).toBeUndefined();
    expect(buildFilters({ industries: ['community', 'legal'] }).sectors).toEqual(['legal']);
  });

  it('adds mapped industries to the sectors asked for, without repeats', () => {
    expect(requestedSectors({ sectors: ['legal'], industries: ['law', 'fintech'] })).toEqual(['legal', 'finance']);
  });

  it('leaves the other filters as they were', () => {
    const filters = buildFilters({ search: 'ai', format: 'podcast', sectors: 'media', isRemote: 'true' });
    expect(filters).toEqual({ search: 'ai', format: ['podcast'], sectors: ['media'], isRemote: true });
  });
});

describe('buildFilters: lane', () => {
  it('reads one of the three lanes', () => {
    expect(buildFilters({ lane: 'closing' }).lane).toBe('closing');
    expect(buildFilters({ lane: 'open' }).lane).toBe('open');
    expect(buildFilters({ lane: 'watch' }).lane).toBe('watch');
  });

  it('ignores anything else, so the list holds every lane as it did before lanes', () => {
    expect(buildFilters({}).lane).toBeUndefined();
    expect(buildFilters({ lane: 'all' }).lane).toBeUndefined();
    expect(buildFilters({ lane: ['closing', 'open'] }).lane).toBeUndefined();
  });
});

describe('liveSearchTopics', () => {
  it('searches for the term of each selected sector', () => {
    expect(liveSearchTopics({ sectors: ['pr-communications', 'hr'] })).toEqual(['public relations', 'human resources']);
  });

  it('keeps old industries as they were typed', () => {
    expect(liveSearchTopics({ sectors: 'healthcare', industries: 'patient safety' })).toEqual(['healthcare', 'patient safety']);
  });

  it('is empty without a sector or an industry, and for unknown sector ids', () => {
    expect(liveSearchTopics({})).toEqual([]);
    expect(liveSearchTopics({ sectors: 'bogus' })).toEqual([]);
  });
});
