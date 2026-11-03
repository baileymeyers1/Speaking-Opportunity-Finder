import type { SortBy } from 'shared';
import type { OpportunityFilters } from '../services/opportunityService.js';

const SORT_OPTIONS: readonly SortBy[] = ['quality', 'deadline', 'eventDate', 'match'];

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/** Build OpportunityFilters from the raw query params of `GET /api/opportunities`. */
export function buildFilters(query: Record<string, unknown>): OpportunityFilters {
  const {
    search,
    format,
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
  if (industries) filters.industries = toStringArray(industries);
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
