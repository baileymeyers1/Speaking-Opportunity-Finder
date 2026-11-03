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

  it('accepts legacy remote=true', () => {
    expect(searchParamsToFilters(new URLSearchParams('remote=true'))).toEqual({ isRemote: true });
  });

  it('trims search text and ignores blank repeated values', () => {
    const params = new URLSearchParams('q=%20ai%20&industries=&industries=%20health%20');
    expect(searchParamsToFilters(params)).toEqual({ search: 'ai', industries: ['health'] });
  });
});

describe('serializeFilters', () => {
  it('is order-independent for multi-value filters', () => {
    const a = serializeFilters({ industries: ['ai', 'technology'], format: ['podcast', 'conference'] });
    const b = serializeFilters({ industries: ['technology', 'ai'], format: ['conference', 'podcast'] });
    expect(a).toBe(b);
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

  it('defaults to page 1 and no liveSearch flag', () => {
    const query = filtersToApiQuery({});
    expect(query.toString()).toBe('page=1');
  });
});

describe('countActiveFilters / canLiveSearch', () => {
  it('counts advanced filters but not search, sort or page', () => {
    expect(countActiveFilters({ search: 'x', sortBy: 'quality', page: 4 })).toBe(0);
    expect(countActiveFilters(everyFilter)).toBe(8);
  });

  it('allows live search with a term or an industry', () => {
    expect(canLiveSearch({})).toBe(false);
    expect(canLiveSearch({ search: '  ' })).toBe(false);
    expect(canLiveSearch({ search: 'ai' })).toBe(true);
    expect(canLiveSearch({ industries: ['ai'] })).toBe(true);
  });
});

describe('savedSearchToFilters', () => {
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
