import type { ScraperResult } from './index.js';

interface ParsedEntry {
  title: string;
  location?: string | null;
  eventDate?: Date;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  industries?: string[];
}

function normalizeText(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html: string) {
  return normalizeText(html.replace(/<[^>]*>/g, '\n'));
}

function buildAnchorMap(html: string, baseUrl: string) {
  const map = new Map<string, string>();
  const regex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const text = normalizeText(match[2].replace(/<[^>]*>/g, ' '));
    if (!text) continue;
    try {
      const absolute = new URL(href, baseUrl).toString();
      if (!map.has(text)) {
        map.set(text, absolute);
      }
    } catch {
      // Ignore bad URLs
    }
  }
  return map;
}

function parseDateFromText(text: string): Date | undefined {
  const patterns = [
    /(\w+ \d{1,2},?\s*\d{4})/i,
    /(\d{1,2}\s+\w+\s+\d{4})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return undefined;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SpeakingOpportunityFinder/1.0',
      Accept: 'text/html',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.text();
}

async function parseMomencioList(): Promise<ParsedEntry[]> {
  const url = 'https://www.momencio.com/the-50-largest-trade-shows-in-the-united-states/';
  const html = await fetchHtml(url);
  const anchors = buildAnchorMap(html, url);
  const text = stripHtml(html);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const startIndex = lines.findIndex((l) => l.startsWith('Trade Show Venue'));
  if (startIndex === -1) return [];

  const entries: ParsedEntry[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\d+\s+/.test(line)) {
      if (entries.length > 0 && line.toLowerCase().includes('sponsorships')) break;
      continue;
    }

    const cleaned = line.replace(/^\d+\s+/, '');
    const parts = cleaned.split(/ {2,}/).filter(Boolean);
    const title = parts[0]?.trim();
    const location = parts.slice(1).join(' ').trim() || null;

    if (!title) continue;

    let applyUrl: string | null = null;
    for (const [textLabel, href] of anchors.entries()) {
      if (textLabel && title.includes(textLabel)) {
        applyUrl = href;
        break;
      }
    }

    if (!applyUrl) continue;

    entries.push({
      title,
      location,
      applyUrl,
      sourceUrl: url,
      industries: ['trade show', 'events'],
    });
  }

  return entries;
}

async function parseUprintingList(): Promise<ParsedEntry[]> {
  const url = 'https://www.uprinting.com/largest-trade-shows-in-the-united-states.html';
  const html = await fetchHtml(url);
  const anchors = buildAnchorMap(html, url);
  const text = stripHtml(html);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const startIndex = lines.findIndex((l) =>
    l.startsWith('Trade Show Venue Net Square Footage')
  );
  if (startIndex === -1) return [];

  const entries: ParsedEntry[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\d+\s+/.test(line)) {
      if (entries.length > 0 && line.toLowerCase().includes('what is the most attended')) break;
      continue;
    }

    const cleaned = line.replace(/^\d+\s+/, '');
    const title = cleaned.split(/ {2,}/)[0]?.trim();
    if (!title) continue;

    let applyUrl: string | null = null;
    for (const [textLabel, href] of anchors.entries()) {
      if (textLabel && title.includes(textLabel)) {
        applyUrl = href;
        break;
      }
    }

    if (!applyUrl) continue;

    entries.push({
      title,
      location: null,
      applyUrl,
      sourceUrl: url,
      industries: ['trade show', 'events'],
    });
  }

  return entries;
}

async function parseGlobalConferenceUSA(): Promise<ParsedEntry[]> {
  const url = 'https://globalconference.ca/global-conference-in-usa/';
  const html = await fetchHtml(url);
  const anchors = buildAnchorMap(html, url);
  const text = stripHtml(html);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const entries: ParsedEntry[] = [];
  const listStart = lines.findIndex((l) => l.includes('List Of Upcoming Global Conferences in USA'));
  if (listStart === -1) return [];

  for (let i = listStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line.match(/\d{4}/)) continue;

    const date = parseDateFromText(line);
    const titleMatch = line.match(/\d{4}\s+(.+?)\s+[A-Z][a-z]+,\s+USA/);
    const locationMatch = line.match(/([A-Z][a-z]+,\s+USA)/);
    const title = titleMatch ? titleMatch[1].trim() : null;

    if (!title) continue;

    let applyUrl: string | null = null;
    for (const [textLabel, href] of anchors.entries()) {
      if (textLabel && title.includes(textLabel)) {
        applyUrl = href;
        break;
      }
    }

    if (!applyUrl) continue;

    entries.push({
      title,
      location: locationMatch ? locationMatch[1] : null,
      eventDate: date,
      applyUrl,
      sourceUrl: url,
      industries: ['conference'],
    });
  }

  return entries;
}

async function parseInternationalConferenceAlertsUSA(): Promise<ParsedEntry[]> {
  const url = 'https://internationalconferencealerts.com/usa-conferences';
  const html = await fetchHtml(url);
  const anchors = buildAnchorMap(html, url);
  const text = stripHtml(html);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const entries: ParsedEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== 'View Details') continue;

    const title = lines[i + 1];
    if (!title || title.length < 6) continue;

    let dateLine = '';
    let locationLine = '';
    for (let back = i - 1; back >= 0 && back >= i - 6; back--) {
      const candidate = lines[back];
      if (!dateLine && /(\d{4})/.test(candidate)) dateLine = candidate;
      if (!locationLine && candidate.includes('USA')) locationLine = candidate;
    }

    const eventDate = parseDateFromText(dateLine);
    const location = locationLine || null;

    const applyUrl =
      anchors.get(title) ||
      anchors.get('View Details') ||
      null;

    if (!applyUrl) continue;

    entries.push({
      title,
      location,
      eventDate,
      applyUrl,
      sourceUrl: url,
      industries: ['conference'],
    });
  }

  return entries;
}

async function parseConferenceMonkeyUSA(): Promise<ParsedEntry[]> {
  const url = 'https://conferencemonkey.org/top/conferences';
  const html = await fetchHtml(url);
  const anchors = buildAnchorMap(html, url);
  const text = stripHtml(html);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const entries: ParsedEntry[] = [];
  for (const line of lines) {
    if (!line.includes('United States')) continue;

    const titleMatch = line.match(/Conference .*? (.+?) Between/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    if (!title) continue;

    const locationMatch = line.match(/in\s+(.+?,\s+United States)/i);
    const location = locationMatch ? locationMatch[1].trim() : null;

    const dateMatch = line.match(/Between\s+(\d+\s+\w+)\s+and\s+(\d+\s+\w+)\s+in/i);
    const eventDate = dateMatch ? parseDateFromText(dateMatch[2]) : undefined;

    const applyUrl = anchors.get(title) || null;
    if (!applyUrl) continue;

    entries.push({
      title,
      location,
      eventDate,
      applyUrl,
      sourceUrl: url,
      industries: ['conference'],
    });
  }

  return entries;
}

export async function scrapeUsMegaEvents(): Promise<ScraperResult[]> {
  const sources = [
    parseMomencioList(),
    parseUprintingList(),
    parseGlobalConferenceUSA(),
    parseInternationalConferenceAlertsUSA(),
    parseConferenceMonkeyUSA(),
  ];

  const results: ScraperResult[] = [];
  const parsed = await Promise.allSettled(sources);

  for (const entry of parsed) {
    if (entry.status !== 'fulfilled') continue;
    for (const item of entry.value) {
      if (!item.applyUrl) continue;
      results.push({
        title: item.title,
        organization: item.title,
        description: `High-profile event discovered from curated U.S. conference lists.`,
        location: item.location || null,
        isRemote: false,
        eventDate: item.eventDate,
        cfpDeadline: undefined,
        format: 'conference',
        industries: item.industries || ['conference'],
        compensationType: undefined,
        compensationDetails: undefined,
        applyUrl: item.applyUrl,
        source: 'US Mega Events',
        sourceUrl: item.sourceUrl || item.applyUrl,
      });
    }
  }

  return results;
}
