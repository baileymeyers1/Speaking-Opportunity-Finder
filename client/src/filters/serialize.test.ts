import { describe, expect, it } from 'vitest';
import {
  canLiveSearch,
  countActiveFilters,
  filtersToApiQuery,
  filtersToSearchParams,
  savedSearchToFilters,
  searchParamsToFilters,
  serializeFilters,
  type BrowseFilters,
} from './serialize';

const everyFilter: BrowseFilters = {
  search: 'react native',
  sectors: ['software', 'ai'],
  industries: ['technology', 'ai'],
  locations: ['Los Angeles, CA', 'Remote'],
  format: ['conference', 'podcast'],
  isRemote: true,
  compensationType: ['paid', 'travel'],
  compensationMin: 500,
  compensationMax: 1500,
  qualityMin: 40,
  sortBy: 'quality',
  page: 3,
};

describe('filtersToSearchParams / searchParamsToFilters', () => {
  it('round-trips every filter', () => {
    const params = filtersToSearchParams(everyFilter);
    expect(searchParamsToFilters(params)).toEqual(everyFilter);
  });

  it('round-trips through a URL string', () => {
    const url = `/?${filtersToSearchParams(everyFilter).toString()}`;
    const parsed = searchParamsToFilters(new URL(url, 'http://localhost').searchParams);
    expect(parsed).toEqual(everyFilter);
  });

  it('serializes an empty filter set to an empty query', () => {
    expect(filtersToSearchParams({}).toString()).toBe('');
    expect(searchParamsToFilters(new URLSearchParams())).toEqual({});
  });

  it('omits defaults: page 1, zero minimums, remote false', () => {
    const params = filtersToSearchParams({ page: 1, compensationMin: 0, qualityMin: 0, isRemote: false });
    expect(params.toString()).toBe('');
  });

  it('keeps a compensation max of 0 and drops a max that is undefined', () => {
    expect(searchParamsToFilters(filtersToSearchParams({ compensationMax: 0 }))).toEqual({ compensationMax: 0 });
    expect(filtersToSearchParams({}).has('compMax')).toBe(false);
  });

  it('drops malformed values instead of throwing', () => {
    const params = new URLSearchParams(
      'types=conference&types=banquet&sort=random&page=0&compMin=abc&quality=-5&remote=maybe&comp=paid&comp=cash'
    );
    expect(searchParamsToFilters(params)).toEqual({
      format: ['conference'],
      compensationType: ['paid'],
    });
  });

  it('reads sectors, dropping ids that are not on the list and repeats', () => {
    const params = new URLSearchParams('sectors=healthcare&sectors=Healthcare&sectors=bogus&sectors=healthcare&sectors=pr-communications');
    expect(searchParamsToFilters(params)).toEqual({ sectors: ['healthcare', 'pr-communications'] });
    expect(searchParamsToFilters(new URLSearchParams('sectors=bogus'))).toEqual({});
  });

  it('still reads the free-text industries of a link made before sectors', () => {
    expect(searchParamsToFilters(new URLSearchParams('industries=devops'))).toEqual({ industries: ['devops'] });
  });

  it('accepts legacy remote=true', () => {
    expect(searchParamsToFilters(new URLSearchParams('remote=true'))).toEqual({ isRemote: true });
  });

  it('round-trips the best-match sort', () => {
    const params = filtersToSearchParams({ sortBy: 'match' });
    expect(params.toString()).toBe('sort=match');
    expect(searchParamsToFilters(params)).toEqual({ sortBy: 'match' });
    expect(filtersToApiQuery({ sortBy: 'match' }).get('sortBy')).toBe('match');
  });

  it('trims search text and ignores blank repeated values', () => {
    const params = new URLSearchParams('q=%20ai%20&industries=&industries=%20health%20');
    expect(searchParamsToFilters(params)).toEqual({ search: 'ai', industries: ['health'] });
  });
});

describe('lane', () => {
  it('is in the URL only when it is not the default', () => {
    expect(filtersToSearchParams({ lane: 'closing' }).toString()).toBe('');
    expect(filtersToSearchParams({}).toString()).toBe('');
    expect(filtersToSearchParams({ lane: 'open' }).toString()).toBe('lane=open');
    expect(filtersToSearchParams({ lane: 'watch', page: 2 }).toString()).toBe('lane=watch&page=2');
  });

  it('round-trips, dropping the default and anything that is not a lane', () => {
    expect(searchParamsToFilters(new URLSearchParams('lane=watch'))).toEqual({ lane: 'watch' });
    expect(searchParamsToFilters(new URLSearchParams('lane=closing'))).toEqual({});
    expect(searchParamsToFilters(new URLSearchParams('lane=everything'))).toEqual({});
  });

  it('is always sent to the API, so a list is never every lane at once', () => {
    expect(filtersToApiQuery({}).get('lane')).toBe('closing');
    expect(filtersToApiQuery({ lane: 'open' }).get('lane')).toBe('open');
  });

  it('is part of the cache key and not an active filter', () => {
    expect(serializeFilters({ lane: 'open' })).not.toBe(serializeFilters({}));
    expect(serializeFilters({ lane: 'closing' })).toBe(serializeFilters({}));
    expect(countActiveFilters({ lane: 'watch' })).toBe(0);
  });
});

describe('serializeFilters', () => {
  it('is order-independent for multi-value filters', () => {
    const a = serializeFilters({ industries: ['ai', 'technology'], format: ['podcast', 'conference'] });
    const b = serializeFilters({ industries: ['technology', 'ai'], format: ['conference', 'podcast'] });
    expect(a).toBe(b);
    expect(serializeFilters({ sectors: ['legal', 'finance'] })).toBe(serializeFilters({ sectors: ['finance', 'legal'] }));
  });

  it('distinguishes sector selections', () => {
    expect(serializeFilters({ sectors: ['legal'] })).not.toBe(serializeFilters({ sectors: ['finance'] }));
    expect(serializeFilters({ sectors: ['legal'] })).not.toBe(serializeFilters({}));
  });

  it('distinguishes pages and search terms', () => {
    expect(serializeFilters({ page: 2 })).not.toBe(serializeFilters({ page: 3 }));
    expect(serializeFilters({ search: 'a' })).not.toBe(serializeFilters({ search: 'b' }));
  });
});

describe('filtersToApiQuery', () => {
  it('uses the server parameter names and always sends a page', () => {
    const query = filtersToApiQuery(everyFilter, { liveSearch: true });
    expect(query.get('page')).toBe('3');
    expect(query.get('search')).toBe('react native');
    expect(query.getAll('format')).toEqual(['conference', 'podcast']);
    expect(query.getAll('sectors')).toEqual(['software', 'ai']);
    expect(query.getAll('industries')).toEqual(['technology', 'ai']);
    expect(query.getAll('locations')).toEqual(['Los Angeles, CA', 'Remote']);
    expect(query.getAll('compensationType')).toEqual(['paid', 'travel']);
    expect(query.get('isRemote')).toBe('true');
    expect(query.get('compensationMin')).toBe('500');
    expect(query.get('compensationMax')).toBe('1500');
    expect(query.get('qualityMin')).toBe('40');
    expect(query.get('sortBy')).toBe('quality');
    expect(query.get('liveSearch')).toBe('true');
  });

  it('defaults to page 1, the closing lane and no liveSearch flag', () => {
    const query = filtersToApiQuery({});
    expect(query.toString()).toBe('page=1&lane=closing');
  });
});

describe('countActiveFilters / canLiveSearch', () => {
  it('counts advanced filters but not search, sort or page', () => {
    expect(countActiveFilters({ search: 'x', sortBy: 'quality', page: 4 })).toBe(0);
    expect(countActiveFilters(everyFilter)).toBe(9);
    expect(countActiveFilters({ sectors: ['healthcare', 'finance'] })).toBe(1);
  });

  it('allows live search with a term or a sector', () => {
    expect(canLiveSearch({})).toBe(false);
    expect(canLiveSearch({ search: '  ' })).toBe(false);
    expect(canLiveSearch({ search: 'ai' })).toBe(true);
    expect(canLiveSearch({ sectors: ['healthcare'] })).toBe(true);
    expect(canLiveSearch({ industries: ['ai'] })).toBe(true);
  });
});

describe('savedSearchToFilters', () => {
  it('reads the sectors of a saved search, and the industries of one saved before sectors', () => {
    expect(savedSearchToFilters(null, { sectors: ['healthcare', 'bogus', 7] })).toEqual({ sectors: ['healthcare'] });
    expect(savedSearchToFilters(null, { industries: ['devops'] })).toEqual({ industries: ['devops'] });
  });

  it('reads the loosely typed saved JSON and validates it', () => {
    const filters = savedSearchToFilters('ml', {
      industries: ['ai', 42],
      format: ['podcast', 'nope'],
      isRemote: true,
      compensationMin: 100,
      sortBy: 'eventDate',
      page: 9,
    });
    expect(filters).toEqual({
      search: 'ml',
      industries: ['ai'],
      format: ['podcast'],
      isRemote: true,
      compensationMin: 100,
      sortBy: 'eventDate',
    });
  });
});
