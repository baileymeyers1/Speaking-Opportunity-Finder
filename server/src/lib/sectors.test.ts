import { describe, it, expect } from 'vitest';
import { MAX_SECTORS, SECTORS, SECTOR_IDS, isSector, normalizeSectors, sectorLabel, sectorSearchTerm } from './sectors.js';

describe('the sector list', () => {
  it('has 34 sectors with unique, URL-safe ids and unique labels', () => {
    expect(SECTORS).toHaveLength(34);
    expect(new Set(SECTOR_IDS).size).toBe(SECTORS.length);
    expect(new Set(SECTORS.map((sector) => sector.label)).size).toBe(SECTORS.length);
    for (const id of SECTOR_IDS) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('covers non-tech sectors as well as tech ones', () => {
    for (const id of ['healthcare', 'finance', 'marketing', 'pr-communications', 'education', 'legal', 'hr', 'energy', 'manufacturing', 'government', 'nonprofit', 'science']) {
      expect(isSector(id)).toBe(true);
    }
    for (const id of ['ai', 'data', 'cloud-devops', 'security', 'software', 'design']) expect(isSector(id)).toBe(true);
  });

  it('keeps marketing and PR apart', () => {
    expect(sectorLabel('marketing')).toBe('Marketing & Advertising');
    expect(sectorLabel('pr-communications')).toBe('PR & Communications');
  });

  it('gives every sector a term a live search can use', () => {
    for (const id of SECTOR_IDS) expect(sectorSearchTerm(id).length).toBeGreaterThan(2);
  });
});

describe('isSector and sectorLabel', () => {
  it('accepts only ids on the list', () => {
    expect(isSector('healthcare')).toBe(true);
    expect(isSector('Healthcare')).toBe(false);
    expect(isSector('artificial intelligence')).toBe(false);
    expect(isSector(undefined)).toBe(false);
  });

  it('shows an unknown id as it is', () => {
    expect(sectorLabel('legal')).toBe('Legal, Risk & Compliance');
    expect(sectorLabel('not-a-sector')).toBe('not-a-sector');
  });
});

describe('normalizeSectors', () => {
  it('drops unknown ids and duplicates and keeps the order', () => {
    expect(normalizeSectors(['healthcare', 'bogus', 'healthcare', 'ai'])).toEqual(['healthcare', 'ai']);
  });

  it('keeps at most two', () => {
    expect(MAX_SECTORS).toBe(2);
    expect(normalizeSectors(['ai', 'data', 'security'])).toEqual(['ai', 'data']);
  });

  it('reads anything that is not a list as none', () => {
    expect(normalizeSectors(null)).toEqual([]);
    expect(normalizeSectors(undefined)).toEqual([]);
    expect(normalizeSectors('ai')).toEqual([]);
    expect(normalizeSectors([1, null, {}])).toEqual([]);
  });
});
