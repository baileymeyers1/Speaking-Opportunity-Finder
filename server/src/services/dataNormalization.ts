const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&nbsp;': ' ', '&ndash;': '\u2013', '&mdash;': '\u2014',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019',
  '&ldquo;': '\u201C', '&rdquo;': '\u201D',
};

export function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  let result = text;

  // Named entities
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    result = result.replaceAll(entity, char);
  }

  // Hex numeric entities: &#x27; &#xA9;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  );

  // Decimal numeric entities: &#39; &#169;
  result = result.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCodePoint(parseInt(dec, 10))
  );

  return result;
}

const CFP_SUFFIXES = [
  / - Call for Speakers$/i,
  / - Call for Papers$/i,
  / - Call for Proposals$/i,
  / - CFP$/i,
  / \| Call for Speakers$/i,
  / \| Call for Papers$/i,
];

export function cleanTitle(raw: string): string {
  let title = raw.trim();
  for (const pattern of CFP_SUFFIXES) {
    title = title.replace(pattern, '');
  }
  return title.trim();
}

const NOISE_PARTS = new Set([
  'call for speakers',
  'call for papers',
  'cfp',
  'call for proposals',
]);

const SEPARATOR_RE = / \| | - | by | @ | at /i;

export function extractOrganization(
  title: string | null | undefined,
  stripYear?: boolean,
): string {
  if (!title || title.trim() === '') return 'Unknown Organization';

  const parts = title.split(SEPARATOR_RE);
  const meaningful = parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !NOISE_PARTS.has(p.toLowerCase()));

  let org = meaningful.length > 0 ? meaningful[0] : 'Unknown Organization';

  if (stripYear) {
    org = org.replace(/\s+\d{4}$/, '');
  }

  return org || 'Unknown Organization';
}

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function parseDate(input: string | null | undefined): Date | null {
  if (!input || input.trim() === '') return null;

  const s = input.trim();

  // ISO: 2026-03-15
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
    if (!isNaN(d.getTime())) return d;
  }

  // MM/DD/YYYY
  const slashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const d = new Date(+slashMatch[3], +slashMatch[1] - 1, +slashMatch[2]);
    if (!isNaN(d.getTime())) return d;
  }

  // Month DD, YYYY or Mon DD, YYYY
  const monthDayYear = s.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthDayYear) {
    const month = MONTH_NAMES[monthDayYear[1].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(+monthDayYear[3], month, +monthDayYear[2]);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // DD Month YYYY
  const dayMonthYear = s.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (dayMonthYear) {
    const month = MONTH_NAMES[dayMonthYear[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(+dayMonthYear[3], month, +dayMonthYear[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

const PLACEHOLDER_PATTERNS = [
  /^Submit your talk/i,
  /^Call for speakers now open/i,
  /^Call for papers now open/i,
  /^We are/i,
  /^We invite you to/i,
];

export function detectPlaceholderDescription(
  desc: string | null | undefined,
): boolean {
  if (!desc || desc.trim() === '') return true;

  const trimmed = desc.trim();

  if (trimmed.length < 60) return true;

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

const JUNK_URL_EXTENSIONS = ['.mp4', '.mp3', '.pdf', '.zip', '.exe', '.doc', '.docx', '.ppt', '.pptx'];
const JUNK_DESCRIPTION_PATTERNS = [
  /please click the link/i,
  /complete this form/i,
  /we cannot provide a description/i,
  /^(TBD|N\/A|None|null|undefined)$/i,
];
const GENERIC_TITLE_PATTERN = /^\d{4}\s+call\s+for\s+(speakers?|papers?|presenters?)\s*$/i;

export function isJunkResult(result: { title: string; description?: string | null; applyUrl?: string }): boolean {
  // Check URL extension
  if (result.applyUrl) {
    try {
      const urlPath = new URL(result.applyUrl).pathname.toLowerCase();
      if (JUNK_URL_EXTENSIONS.some(ext => urlPath.endsWith(ext))) return true;
    } catch {
      // Invalid URL — not necessarily junk
    }
  }

  // Check description patterns
  if (result.description) {
    if (JUNK_DESCRIPTION_PATTERNS.some(p => p.test(result.description!))) return true;
  }

  // Check generic titles with no distinguishing info
  if (GENERIC_TITLE_PATTERN.test(result.title.trim())) return true;

  return false;
}

const GENERIC_TAGS = new Set([
  'events',
  'cross-industry',
  'general',
  'other',
  'misc',
]);

export function normalizeIndustries(
  industries: string[] | null | undefined,
): string[] {
  if (!industries || industries.length === 0) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of industries) {
    const lower = tag.toLowerCase().trim();
    if (lower === '' || GENERIC_TAGS.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    result.push(lower);
    if (result.length >= 5) break;
  }

  return result;
}
