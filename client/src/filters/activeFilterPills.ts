import type { OpportunityFilters } from '../types';
import { COMPENSATION_MAX } from './constants';

export interface FilterPill {
  label: string;
  /** The filters with this one pill removed. */
  next: OpportunityFilters;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatCompensationValue(value: number, isMax: boolean): string {
  if (isMax && value >= COMPENSATION_MAX) return '$2,000+';
  return `$${value.toLocaleString()}`;
}

function without<T>(values: T[] | undefined, value: T): T[] | undefined {
  const next = (values || []).filter((item) => item !== value);
  return next.length > 0 ? next : undefined;
}

/** One removable pill per active filter value, in display order. */
export function buildActiveFilterPills(filters: OpportunityFilters): FilterPill[] {
  const pills: FilterPill[] = [];

  filters.format?.forEach((format) => {
    pills.push({ label: capitalize(format), next: { ...filters, format: without(filters.format, format) } });
  });
  filters.industries?.forEach((industry) => {
    pills.push({
      label: capitalize(industry),
      next: { ...filters, industries: without(filters.industries, industry) },
    });
  });
  if (filters.isRemote) {
    pills.push({ label: 'Remote', next: { ...filters, isRemote: undefined } });
  }
  filters.locations?.forEach((location) => {
    pills.push({ label: location, next: { ...filters, locations: without(filters.locations, location) } });
  });
  filters.compensationType?.forEach((type) => {
    pills.push({
      label: capitalize(type),
      next: { ...filters, compensationType: without(filters.compensationType, type) },
    });
  });
  if (filters.compensationMin) {
    pills.push({
      label: `Min ${formatCompensationValue(filters.compensationMin, false)}`,
      next: { ...filters, compensationMin: undefined },
    });
  }
  if (filters.compensationMax !== undefined && filters.compensationMax < COMPENSATION_MAX) {
    pills.push({
      label: `Max ${formatCompensationValue(filters.compensationMax, true)}`,
      next: { ...filters, compensationMax: undefined },
    });
  }
  if (filters.qualityMin) {
    pills.push({ label: `Quality ${filters.qualityMin}+`, next: { ...filters, qualityMin: undefined } });
  }

  return pills;
}
