import type { CompensationType, OpportunityFilters, OpportunityFormat, SortBy } from '../types';
import { COMPENSATION_TYPES, OPPORTUNITY_FORMATS, SORT_OPTIONS } from './constants';

/**
 * Everything the browse page needs to render a list: the filters plus the page.
 * The URL is the single source of truth for this object; nothing else stores it.
 */
export interface BrowseFilters extends OpportunityFilters {
  page?: number;
}

/** URL parameter names. Kept short because they are user-visible. */
const URL_KEYS = {
  search: 'q',
  industries: 'industries',
  locations: 'locations',
  format: 'types',
  isRemote: 'remote',
  compensationType: 'comp',
  compensationMin: 'compMin',
  compensationMax: 'compMax',
  qualityMin: 'quality',
  sortBy: 'sort',
  page: 'page',
} as const;

function isFormat(value: string): value is OpportunityFormat {
  return (OPPORTUNITY_FORMATS as readonly string[]).includes(value);
}

function isCompensationType(value: string): value is CompensationType {
  return (COMPENSATION_TYPES as readonly string[]).includes(value);
}

function isSortBy(value: string): value is SortBy {
  return (SORT_OPTIONS as readonly string[]).includes(value);
}

function parseNonNegativeInt(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function nonEmpty(values: string[]): string[] | undefined {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Serialize filters to URL search params. Omits defaults so the bare URL stays clean. */
export function filtersToSearchParams(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set(URL_KEYS.search, filters.search.trim());
  filters.industries?.forEach((industry) => params.append(URL_KEYS.industries, industry));
  filters.locations?.forEach((location) => params.append(URL_KEYS.locations, location));
  filters.format?.forEach((format) => params.append(URL_KEYS.format, format));
  if (filters.isRemote) params.set(URL_KEYS.isRemote, '1');
  filters.compensationType?.forEach((type) => params.append(URL_KEYS.compensationType, type));
  if (filters.compensationMin !== undefined && filters.compensationMin > 0) {
    params.set(URL_KEYS.compensationMin, String(filters.compensationMin));
  }
  if (filters.compensationMax !== undefined) {
    params.set(URL_KEYS.compensationMax, String(filters.compensationMax));
  }
  if (filters.qualityMin !== undefined && filters.qualityMin > 0) {
    params.set(URL_KEYS.qualityMin, String(filters.qualityMin));
  }
  if (filters.sortBy) params.set(URL_KEYS.sortBy, filters.sortBy);
  if (filters.page !== undefined && filters.page > 1) params.set(URL_KEYS.page, String(filters.page));
  return params;
}

/** Parse URL search params back into filters, dropping anything malformed. */
export function searchParamsToFilters(params: URLSearchParams): BrowseFilters {
  const filters: BrowseFilters = {};

  const search = params.get(URL_KEYS.search)?.trim();
  if (search) filters.search = search;

  const industries = nonEmpty(params.getAll(URL_KEYS.industries));
  if (industries) filters.industries = industries;

  const locations = nonEmpty(params.getAll(URL_KEYS.locations));
  if (locations) filters.locations = locations;

  const formats = params.getAll(URL_KEYS.format).filter(isFormat);
  if (formats.length > 0) filters.format = formats;

  const remote = params.get(URL_KEYS.isRemote);
  if (remote === '1' || remote === 'true') filters.isRemote = true;

  const compensationTypes = params.getAll(URL_KEYS.compensationType).filter(isCompensationType);
  if (compensationTypes.length > 0) filters.compensationType = compensationTypes;

  const compensationMin = parseNonNegativeInt(params.get(URL_KEYS.compensationMin));
  if (compensationMin !== undefined && compensationMin > 0) filters.compensationMin = compensationMin;

  const compensationMax = parseNonNegativeInt(params.get(URL_KEYS.compensationMax));
  if (compensationMax !== undefined) filters.compensationMax = compensationMax;

  const qualityMin = parseNonNegativeInt(params.get(URL_KEYS.qualityMin));
  if (qualityMin !== undefined && qualityMin > 0) filters.qualityMin = qualityMin;

  const sortBy = params.get(URL_KEYS.sortBy);
  if (sortBy && isSortBy(sortBy)) filters.sortBy = sortBy;

  const page = parseNonNegativeInt(params.get(URL_KEYS.page));
  if (page !== undefined && page > 1) filters.page = page;

  return filters;
}

/**
 * Canonical string for a set of filters. Two filter objects that mean the same
 * thing produce the same string, so it doubles as a cache key.
 */
export function serializeFilters(filters: BrowseFilters): string {
  const canonical: BrowseFilters = {
    ...filters,
    industries: filters.industries ? [...filters.industries].sort() : undefined,
    locations: filters.locations ? [...filters.locations].sort() : undefined,
    format: filters.format ? [...filters.format].sort() : undefined,
    compensationType: filters.compensationType ? [...filters.compensationType].sort() : undefined,
  };
  return filtersToSearchParams(canonical).toString();
}

/** Query string for `GET /api/opportunities`, which uses its own parameter names. */
export function filtersToApiQuery(
  filters: BrowseFilters,
  options: { liveSearch?: boolean } = {}
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(filters.page ?? 1));
  if (filters.search) params.set('search', filters.search);
  if (filters.isRemote) params.set('isRemote', 'true');
  if (filters.compensationMin) params.set('compensationMin', String(filters.compensationMin));
  if (filters.compensationMax !== undefined) params.set('compensationMax', String(filters.compensationMax));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.qualityMin !== undefined) params.set('qualityMin', String(filters.qualityMin));
  filters.locations?.forEach((location) => params.append('locations', location));
  filters.format?.forEach((format) => params.append('format', format));
  filters.industries?.forEach((industry) => params.append('industries', industry));
  filters.compensationType?.forEach((type) => params.append('compensationType', type));
  if (options.liveSearch) params.set('liveSearch', 'true');
  return params;
}

/** Number of non-default filters set, excluding search text, sort and page. */
export function countActiveFilters(filters: BrowseFilters): number {
  return [
    filters.format?.length,
    filters.industries?.length,
    filters.compensationType?.length,
    filters.isRemote,
    filters.locations?.length,
    filters.compensationMin,
    filters.compensationMax !== undefined,
    filters.qualityMin,
  ].filter(Boolean).length;
}

/** Live search needs something to search for: a term or at least one industry. */
export function canLiveSearch(filters: BrowseFilters): boolean {
  return Boolean(filters.search?.trim()) || Boolean(filters.industries?.length);
}

/** Interpret the loosely typed JSON stored on a saved search as filters. */
export function savedSearchToFilters(query: string | null, saved: Record<string, unknown>): BrowseFilters {
  const params = new URLSearchParams();
  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  if (query) params.set(URL_KEYS.search, query);
  asStringArray(saved.industries).forEach((value) => params.append(URL_KEYS.industries, value));
  asStringArray(saved.locations).forEach((value) => params.append(URL_KEYS.locations, value));
  asStringArray(saved.format).forEach((value) => params.append(URL_KEYS.format, value));
  asStringArray(saved.compensationType).forEach((value) => params.append(URL_KEYS.compensationType, value));
  if (saved.isRemote === true) params.set(URL_KEYS.isRemote, '1');
  if (typeof saved.compensationMin === 'number') params.set(URL_KEYS.compensationMin, String(saved.compensationMin));
  if (typeof saved.compensationMax === 'number') params.set(URL_KEYS.compensationMax, String(saved.compensationMax));
  if (typeof saved.qualityMin === 'number') params.set(URL_KEYS.qualityMin, String(saved.qualityMin));
  if (typeof saved.sortBy === 'string') params.set(URL_KEYS.sortBy, saved.sortBy);
  return searchParamsToFilters(params);
}
