import { describe, it, expect } from 'vitest';
import { SECTORS, SECTOR_IDS } from '../lib/sectors.js';
import { BROAD_PHRASES } from './sectorBroadWords.js';
import { SECTOR_PHRASES } from './sectorPhrases.js';
import { isKnownTag, sectorsFromIndustriesJson, sectorsFromTags, tagWords } from './sectorMapping.js';

describe('the phrase tables', () => {
  it('has phrases for every sector', () => {
    for (const id of SECTOR_IDS) expect(SECTOR_PHRASES[id].length).toBeGreaterThan(5);
  });

  it('maps every sector search term back to its own sector', () => {
    for (const sector of SECTORS) expect(sectorsFromTags([sector.searchTerm])[0]).toBe(sector.id);
  });

  it('never lists a broad word as a sector phrase too', () => {
    const strong = new Set(Object.values(SECTOR_PHRASES).flatMap((phrases) => phrases.map((phrase) => tagWords(phrase).join(' '))));
    for (const phrase of Object.keys(BROAD_PHRASES)) expect(strong.has(tagWords(phrase).join(' '))).toBe(false);
  });

  it('lists no phrase under more than two sectors', () => {
    const sectorsByPhrase = new Map<string, string[]>();
    for (const [sector, phrases] of Object.entries(SECTOR_PHRASES)) {
      for (const phrase of new Set(phrases.map((item) => tagWords(item).join(' ')))) {
        sectorsByPhrase.set(phrase, [...(sectorsByPhrase.get(phrase) ?? []), sector]);
      }
    }
    const crowded = [...sectorsByPhrase.entries()].filter(([, sectors]) => sectors.length > 2);
    expect(crowded).toEqual([]);
  });

  it('only lets a broad word stand alone for a sector it supports', () => {
    for (const entry of Object.values(BROAD_PHRASES)) {
      if (entry.alone) expect(entry.supports).toContain(entry.alone);
    }
  });
});

describe('sectorsFromTags', () => {
  it('folds the spellings the audit found into one sector', () => {
    for (const tag of ['ai', 'AI', 'artificial intelligence', 'Artificial Intelligence', 'machine learning', 'machine-learning']) {
      expect(sectorsFromTags([tag])).toEqual(['ai']);
    }
    for (const tag of ['open source', 'open-source', 'Open Source']) expect(sectorsFromTags([tag])).toEqual(['software']);
    for (const tag of ['security', 'cybersecurity', 'information security', 'infosec']) {
      expect(sectorsFromTags([tag])).toEqual(['security']);
    }
  });

  it('does not fold "securities" into "security"', () => {
    expect(sectorsFromTags(['securities'])).toEqual(['finance']);
    expect(sectorsFromTags(['security'])).toEqual(['security']);
  });

  it('ignores case, hyphens and plurals', () => {
    expect(sectorsFromTags(['Databases'])).toEqual(['data']);
    expect(sectorsFromTags(['DATA-ENGINEERING'])).toEqual(['data']);
    expect(sectorsFromTags(['startups'])).toEqual(['business']);
    expect(sectorsFromTags(['.NET'])).toEqual(['software']);
  });

  it('places non-tech tags in non-tech sectors', () => {
    expect(sectorsFromTags(['nursing'])).toEqual(['healthcare']);
    expect(sectorsFromTags(['wealth management'])).toEqual(['finance']);
    expect(sectorsFromTags(['human resources'])).toEqual(['hr']);
    expect(sectorsFromTags(['renewable energy'])).toEqual(['energy']);
    expect(sectorsFromTags(['civil engineering'])).toEqual(['construction']);
    expect(sectorsFromTags(['higher education'])).toEqual(['education']);
    expect(sectorsFromTags(['nonprofit'])).toEqual(['nonprofit']);
  });

  it('matches the longest phrase before a word inside it', () => {
    expect(sectorsFromTags(['food security'])).toEqual(['agriculture']);
    expect(sectorsFromTags(['software supply chain'])).toEqual(['security']);
    expect(sectorsFromTags(['supply chain'])).toEqual(['transport']);
    expect(sectorsFromTags(['communication engineering'])).toEqual(['engineering']);
    expect(sectorsFromTags(['data privacy'])).toContain('security');
    expect(sectorsFromTags(['data privacy'])).not.toContain('data');
  });

  it('reads the words of a long tag one phrase at a time', () => {
    expect(sectorsFromTags(['Clinical Nursing'])).toEqual(['healthcare']);
    expect(sectorsFromTags(['nursing education'])).toEqual(['healthcare', 'education']);
  });

  it('keeps marketing and PR apart', () => {
    expect(sectorsFromTags(['digital marketing', 'advertising'])).toEqual(['marketing']);
    expect(sectorsFromTags(['public relations'])).toEqual(['pr-communications']);
    expect(sectorsFromTags(['pr', 'media relations'])).toEqual(['pr-communications']);
    expect(sectorsFromTags(['corporate communications'])).toEqual(['pr-communications']);
  });

  it('lets the sector most tags name come first, the earlier tag breaking a tie', () => {
    expect(sectorsFromTags(['ai', 'devops', 'cloud', 'kubernetes', 'healthcare'])).toEqual(['cloud-devops', 'ai']);
    expect(sectorsFromTags(['healthcare', 'ai'])).toEqual(['healthcare', 'ai']);
    expect(sectorsFromTags(['ai', 'healthcare'])).toEqual(['ai', 'healthcare']);
  });

  it('returns at most two sectors', () => {
    expect(sectorsFromTags(['ai', 'healthcare', 'finance', 'legal', 'education'])).toHaveLength(2);
  });

  it('returns nothing for no tags, format words and unknown tags', () => {
    expect(sectorsFromTags([])).toEqual([]);
    expect(sectorsFromTags(null)).toEqual([]);
    expect(sectorsFromTags(undefined)).toEqual([]);
    expect(sectorsFromTags(['workshops', 'conference', 'cross-industry'])).toEqual([]);
    expect(sectorsFromTags(['community', 'talks'])).toEqual([]);
  });
});

describe('words too broad to decide alone', () => {
  it('never lets "communications" decide PR on its own', () => {
    expect(sectorsFromTags(['communications'])).toEqual([]);
    expect(sectorsFromTags(['communication'])).toEqual([]);
    // International Conference on Computer and Communication Engineering (wikicfp.com, production 2026-11-18).
    const sectors = sectorsFromTags(['computing', 'communications', 'software engineering', 'artificial intelligence', 'electronics']);
    expect(sectors).toEqual(['software', 'engineering']);
    expect(sectors).not.toContain('pr-communications');
  });

  it('counts "communications" for the sector another tag already names', () => {
    expect(sectorsFromTags(['pr', 'ai', 'communications'])).toEqual(['pr-communications', 'ai']);
    expect(sectorsFromTags(['higher-education', 'marketing', 'communications', 'digital', 'web'])[0]).toBe('marketing');
    expect(sectorsFromTags(['journalism', 'communication', 'media studies'])[0]).toBe('media');
  });

  it('reads "architecture" by its company', () => {
    expect(sectorsFromTags(['architecture'])).toEqual([]);
    expect(sectorsFromTags(['civil engineering', 'architecture', 'urban planning'])).toEqual(['construction']);
    expect(sectorsFromTags(['software engineering', 'architecture', 'devops'])[0]).toBe('software');
  });

  it('places a row tagged only "technology" in software, and lets any real tag override it', () => {
    expect(sectorsFromTags(['technology'])).toEqual(['software']);
    expect(sectorsFromTags(['technology', 'computer science'])).toEqual(['software']);
    expect(sectorsFromTags(['technology', 'healthcare'])).toEqual(['healthcare']);
    expect(sectorsFromTags(['wealth management', 'investment', 'technology'])).toEqual(['finance']);
  });

  it('places a row tagged only "research" in science, and otherwise follows the subject', () => {
    expect(sectorsFromTags(['Research', 'Academia'])).toEqual(['science']);
    expect(sectorsFromTags(['education', 'research'])).toEqual(['education']);
  });
});

describe('isKnownTag', () => {
  it('tells tags the mapping can read from ones it cannot', () => {
    expect(isKnownTag('pediatric dentistry')).toBe(true);
    expect(isKnownTag('community')).toBe(true);
    expect(isKnownTag('julialang')).toBe(false);
  });
});

describe('sectorsFromIndustriesJson', () => {
  it('reads the stored JSON string', () => {
    expect(sectorsFromIndustriesJson('["devops","cloud"]')).toEqual(['cloud-devops']);
  });

  it('reads malformed or empty values as no tags', () => {
    expect(sectorsFromIndustriesJson('not json')).toEqual([]);
    expect(sectorsFromIndustriesJson('{"a":1}')).toEqual([]);
    expect(sectorsFromIndustriesJson(null)).toEqual([]);
    expect(sectorsFromIndustriesJson('[1, null, "ai"]')).toEqual(['ai']);
  });
});
