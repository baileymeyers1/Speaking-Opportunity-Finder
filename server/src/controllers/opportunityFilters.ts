import type { SortBy } from 'shared';
import { isSector, sectorSearchTerm, type Sector } from '../lib/sectors.js';
import type { OpportunityFilters } from '../services/opportunityService.js';
import { sectorsFromTags } from '../services/sectorMapping.js';

const SORT_OPTIONS: readonly SortBy[] = ['quality', 'deadline', 'eventDate', 'match'];

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/** The valid sector ids of a `sectors` query parameter. */
export function sectorParams(value: unknown): Sector[] {
  if (value === undefined || value === null || value === '') return [];
  return [...new Set(toStringArray(value).filter(isSector))];
}

/** The values of the old free-text `industries` parameter, from links and saved searches made before sectors. */
export function legacyIndustryParams(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  return toStringArray(value).map((industry) => industry.trim()).filter(Boolean);
}

/**
 * The sectors a request filters on: the `sectors` parameter, plus the sector
 * each old `industries` value maps to ("devops" is cloud-devops), so a link or
 * a saved search made before sectors keeps narrowing the list. An old value no
 * sector matches is ignored.
 */
export function requestedSectors(query: { sectors?: unknown; industries?: unknown }): Sector[] {
  const fromIndustries = legacyIndustryParams(query.industries).flatMap((industry) => sectorsFromTags([industry]));
  return [...new Set([...sectorParams(query.sectors), ...fromIndustries])];
}

/**
 * What a live search looks for besides the query text: the search term of each
 * selected sector, and old `industries` values as they were typed.
 */
export function liveSearchTopics(query: { sectors?: unknown; industries?: unknown }): string[] {
  return [...new Set([...sectorParams(query.sectors).map(sectorSearchTerm), ...legacyIndustryParams(query.industries)])];
}

/** Build OpportunityFilters from the raw query params of `GET /api/opportunities`. */
export function buildFilters(query: Record<string, unknown>): OpportunityFilters {
  const {
    search,
    format,
    sectors,
    industries,
    isRemote,
    locations: location,
    compensationType,
    compensationMin,
    compensationMax,
    cfpDeadlineBefore,
    cfpDeadlineAfter,
    sortBy,
    qualityMin,
  } = query;

  const filters: OpportunityFilters = {};

  if (search) filters.search = String(search);
  if (format) filters.format = toStringArray(format);
  const sectorFilter = requestedSectors({ sectors, industries });
  if (sectorFilter.length > 0) filters.sectors = sectorFilter;
  if (isRemote !== undefined) filters.isRemote = isRemote === 'true';

  // Multiple locations are joined with | because locations themselves contain commas.
  if (location) filters.location = toStringArray(location).join('|');

  if (compensationType) filters.compensationType = toStringArray(compensationType);
  if (compensationMin) filters.compensationMin = parseInt(String(compensationMin), 10);
  if (compensationMax) filters.compensationMax = parseInt(String(compensationMax), 10);
  if (cfpDeadlineBefore) filters.cfpDeadlineBefore = new Date(String(cfpDeadlineBefore));
  if (cfpDeadlineAfter) filters.cfpDeadlineAfter = new Date(String(cfpDeadlineAfter));

  if (sortBy && (SORT_OPTIONS as readonly string[]).includes(String(sortBy))) {
    filters.sortBy = String(sortBy) as SortBy;
  }

  if (qualityMin !== undefined) {
    const value = parseInt(String(qualityMin), 10);
    if (!isNaN(value)) filters.qualityMin = value;
  }

  return filters;
}
