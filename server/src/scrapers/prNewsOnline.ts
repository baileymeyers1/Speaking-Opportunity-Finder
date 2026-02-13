import type { ScraperResult } from './index.js';

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

function parseDate(text: string): Date | undefined {
  const match = text.match(/(\w+ \d{1,2},?\s*\d{4})/);
  if (!match) return undefined;
  const parsed = new Date(match[1]);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export async function scrapePrNewsOnline(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  const year = new Date().getFullYear();
  const url = `https://www.prnewsonline.com/${year}-prnews-events-awards/`;

  console.log(`Fetching events from prnewsonline.com (${year})...`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      headers: { Accept: 'text/html, */*', 'User-Agent': 'Mozilla/5.0 (compatible; SpeakingOpportunityFinder/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.log(`prnewsonline.com returned ${response.status}, skipping...`);
      return results;
    }
    const html = await response.text();
    const anchors = buildAnchorMap(html, url);
    const text = stripHtml(html);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.match(/\d{4}/)) continue;
      const date = parseDate(line);
      const title = lines[i + 1];
      if (!title || title.length < 5) continue;
      const applyUrl = anchors.get(title) || url;

      results.push({
        title: `${title} - Call for Speakers`,
        organization: title,
        description: `Event listed on prnewsonline.com.`,
        location: null,
        isRemote: false,
        eventDate: date,
        cfpDeadline: undefined,
        format: 'conference',
        industries: ['communications', 'marketing'],
        compensationType: undefined,
        compensationDetails: undefined,
        applyUrl,
        source: 'prnewsonline.com',
        sourceUrl: url,
      });
    }
    console.log(`Found ${results.length} events from prnewsonline.com`);
  } catch (error) {
    console.error('Error scraping prnewsonline.com:', error instanceof Error ? error.message : error);
  }

  return results;
}
