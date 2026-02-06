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
      // Ignore invalid URLs
    }
  }
  return map;
}

function parseDateFromParts(monthYear: string, dayStr: string): Date | undefined {
  const composed = `${dayStr} ${monthYear}`;
  const parsed = new Date(composed);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export async function scrapeConferenceAlertsUSA(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  const url = 'https://conferencealerts.com/country-listing.php?country=United+States+of+America&ipp=All&page=1';

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SpeakingOpportunityFinder/1.0',
        Accept: 'text/html',
      },
    });
    if (!response.ok) return results;

    const html = await response.text();
    const anchors = buildAnchorMap(html, url);
    const text = stripHtml(html);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    let currentMonthYear = '';
    for (const line of lines) {
      if (line.match(/^\w+\s+\d{4}$/)) {
        currentMonthYear = line;
        continue;
      }

      if (!currentMonthYear) continue;

      const dayMatch = line.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+\|\s+(.+?)\s+([A-Za-z\s]+),\s+United States of America/i);
      if (dayMatch) {
        const day = dayMatch[1];
        const title = dayMatch[2].trim();
        const location = `${dayMatch[3].trim()}, United States`;
        const eventDate = parseDateFromParts(currentMonthYear, day);
        const applyUrl = anchors.get(title) || url;

        results.push({
          title: `${title} - Call for Speakers`,
          organization: title,
          description: `Conference listed on conferencealerts.com.`,
          location,
          isRemote: false,
          eventDate,
          cfpDeadline: undefined,
          format: 'conference',
          industries: ['conference'],
          compensationType: undefined,
          compensationDetails: undefined,
          applyUrl,
          source: 'conferencealerts.com',
          sourceUrl: url,
        });
      }
    }
  } catch {
    return results;
  }

  return results;
}
