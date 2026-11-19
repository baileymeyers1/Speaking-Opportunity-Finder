/**
 * The fixed list of sectors an opportunity can belong to: one or two per row.
 *
 * Free-text `industries` tags stay on every row for search and the match
 * score, but nothing can be filtered or counted by them (1,368 distinct tags
 * on 1,056 listed cards, production, 2026-11-18). Sectors are what the filter
 * and every count use.
 *
 * Ids are stored in the database, sent to Claude as the extraction enum and
 * written into URLs, so an id never changes once shipped; labels are display
 * text. Pure, no imports: the client reads this file by path
 * (client/src/lib/sectors.ts), like lib/deadlines.ts.
 */
export const SECTORS = [
  { id: 'ai', label: 'AI & Machine Learning', searchTerm: 'artificial intelligence' },
  { id: 'data', label: 'Data & Analytics', searchTerm: 'data analytics' },
  { id: 'cloud-devops', label: 'Cloud, DevOps & Infrastructure', searchTerm: 'devops' },
  { id: 'security', label: 'Cybersecurity & Privacy', searchTerm: 'cybersecurity' },
  { id: 'software', label: 'Software Development', searchTerm: 'software development' },
  { id: 'design', label: 'Design & UX', searchTerm: 'ux design' },
  { id: 'product', label: 'Product & Project Management', searchTerm: 'product management' },
  { id: 'enterprise-it', label: 'Enterprise IT & Business Apps', searchTerm: 'enterprise it' },
  { id: 'business', label: 'Business, Startups & Entrepreneurship', searchTerm: 'entrepreneurship' },
  { id: 'leadership', label: 'Leadership & Professional Development', searchTerm: 'leadership' },
  { id: 'marketing', label: 'Marketing & Advertising', searchTerm: 'marketing' },
  { id: 'pr-communications', label: 'PR & Communications', searchTerm: 'public relations' },
  { id: 'finance', label: 'Finance, Banking & Insurance', searchTerm: 'finance' },
  { id: 'legal', label: 'Legal, Risk & Compliance', searchTerm: 'legal' },
  { id: 'hr', label: 'HR, Talent & Workplace', searchTerm: 'human resources' },
  { id: 'retail', label: 'Retail, E-commerce & Consumer Goods', searchTerm: 'retail' },
  { id: 'hospitality', label: 'Hospitality, Travel & Events', searchTerm: 'hospitality' },
  { id: 'healthcare', label: 'Healthcare & Medicine', searchTerm: 'healthcare' },
  { id: 'life-sciences', label: 'Life Sciences, Pharma & Biotech', searchTerm: 'biotech' },
  { id: 'wellness', label: 'Wellness, Fitness & Sports', searchTerm: 'wellness' },
  { id: 'engineering', label: 'Engineering, Electronics & Robotics', searchTerm: 'engineering' },
  { id: 'manufacturing', label: 'Manufacturing & Industrial', searchTerm: 'manufacturing' },
  { id: 'energy', label: 'Energy & Utilities', searchTerm: 'energy' },
  { id: 'environment', label: 'Climate, Environment & Sustainability', searchTerm: 'sustainability' },
  { id: 'transport', label: 'Transportation, Logistics & Supply Chain', searchTerm: 'logistics' },
  { id: 'aerospace', label: 'Aerospace & Defense', searchTerm: 'aerospace' },
  { id: 'construction', label: 'Construction, Real Estate & Built Environment', searchTerm: 'construction' },
  { id: 'agriculture', label: 'Agriculture & Food', searchTerm: 'agriculture' },
  { id: 'education', label: 'Education & Training', searchTerm: 'education' },
  { id: 'government', label: 'Government, Policy & Public Sector', searchTerm: 'government' },
  { id: 'nonprofit', label: 'Nonprofit & Social Impact', searchTerm: 'nonprofit' },
  { id: 'science', label: 'Science & Research', searchTerm: 'science' },
  { id: 'humanities', label: 'Humanities & Social Sciences', searchTerm: 'humanities' },
  { id: 'media', label: 'Media, Arts & Entertainment', searchTerm: 'media' },
] as const;

export type Sector = (typeof SECTORS)[number]['id'];

export const SECTOR_IDS: readonly Sector[] = SECTORS.map((sector) => sector.id);

/** An opportunity carries at most this many sectors. */
export const MAX_SECTORS = 2;

const BY_ID = new Map<string, (typeof SECTORS)[number]>(SECTORS.map((sector) => [sector.id, sector]));

export function isSector(value: unknown): value is Sector {
  return typeof value === 'string' && BY_ID.has(value);
}

/** Display label of a sector id; an unknown id is shown as it is. */
export function sectorLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** What a live search looks for when a sector is selected. */
export function sectorSearchTerm(id: Sector): string {
  return BY_ID.get(id)!.searchTerm;
}

/** The valid sector ids of a value, without duplicates, capped at `MAX_SECTORS`. */
export function normalizeSectors(value: unknown): Sector[] {
  if (!Array.isArray(value)) return [];
  const sectors: Sector[] = [];
  for (const item of value) {
    if (isSector(item) && !sectors.includes(item)) sectors.push(item);
    if (sectors.length >= MAX_SECTORS) break;
  }
  return sectors;
}
