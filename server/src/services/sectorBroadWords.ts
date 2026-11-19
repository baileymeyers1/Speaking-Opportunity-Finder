import type { Sector } from '../lib/sectors.js';

export interface BroadPhrase {
  /** Sectors the word can add weight to, when another tag of the row already names one of them. */
  supports: readonly Sector[];
  /** The sector a row takes when it carries nothing but broad words; absent when the word alone says nothing. */
  alone?: Sector;
}

/**
 * Words too broad to place a row on their own. "architecture" next to "civil
 * engineering" is buildings, next to "devops" it is software;
 * "communications" next to "public relations" is PR, next to "electronics" it
 * is telecoms. A broad word never names a sector the row's other tags do not.
 */
export const BROAD_PHRASES: Record<string, BroadPhrase> = {
  technology: { supports: ['software'], alone: 'software' },
  tech: { supports: ['software'], alone: 'software' },
  it: { supports: ['software', 'enterprise-it'], alone: 'software' },
  'information technology': { supports: ['software', 'enterprise-it'], alone: 'software' },
  ict: { supports: ['software', 'engineering'], alone: 'software' },
  computing: { supports: ['software'], alone: 'software' },
  'computer science': { supports: ['software', 'ai', 'data'], alone: 'software' },
  'high tech': { supports: ['software'], alone: 'software' },
  'emerging tech': { supports: ['software'], alone: 'software' },
  internet: { supports: ['software'], alone: 'software' },
  digital: { supports: ['software', 'marketing'] },
  'digital transformation': { supports: ['enterprise-it', 'business'], alone: 'enterprise-it' },
  digitalization: { supports: ['enterprise-it', 'business'], alone: 'enterprise-it' },
  development: { supports: ['software'] },
  innovation: { supports: ['business'] },
  management: { supports: ['leadership', 'business'], alone: 'leadership' },
  research: { supports: ['science', 'humanities', 'education'], alone: 'science' },
  academia: { supports: ['science', 'humanities', 'education'], alone: 'science' },
  academic: { supports: ['science', 'humanities', 'education'], alone: 'science' },
  'academic research': { supports: ['science', 'humanities', 'education'], alone: 'science' },
  multidisciplinary: { supports: ['science'], alone: 'science' },
  interdisciplinary: { supports: ['science'], alone: 'science' },
  communications: { supports: ['pr-communications', 'marketing', 'media', 'engineering'] },
  architecture: { supports: ['software', 'construction'] },
  infrastructure: { supports: ['cloud-devops', 'construction', 'energy'] },
  networking: { supports: ['cloud-devops', 'security', 'engineering'] },
  network: { supports: ['cloud-devops', 'security', 'engineering'] },
  automation: { supports: ['enterprise-it', 'manufacturing', 'cloud-devops', 'engineering'] },
  performance: { supports: ['software', 'data'] },
  identity: { supports: ['security'] },
  agent: { supports: ['ai'] },
  ethics: { supports: ['humanities', 'legal'] },
  fraud: { supports: ['finance', 'security'] },
  quality: { supports: ['manufacturing', 'software'] },
  safety: { supports: ['manufacturing', 'healthcare', 'transport'] },
  community: { supports: [] },
  'community building': { supports: [] },
};
