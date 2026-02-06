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

function extractDeadline(html: string): Date | undefined {
  const patterns = [
    /(?:proposal deadline|submission deadline|deadline)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i,
    /(?:proposal deadline|submission deadline|deadline)[:\s]*(\d{4}-\d{2}-\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  return undefined;
}

export async function scrapePacEvents(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  const url = 'https://pac.org/events';

  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': 'SpeakingOpportunityFinder/1.0' },
    });
    if (!response.ok) return results;
    const html = await response.text();
    const anchors = buildAnchorMap(html, url);
    const text = stripHtml(html);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.match(/\d{4}/)) continue;

      const date = parseDate(line);
      const title = lines[i + 1];
      if (!title || title.length < 4) continue;
      const applyUrl = anchors.get(title) || url;
      let cfpDeadline: Date | undefined;

      if (applyUrl !== url) {
        try {
          const detailResponse = await fetch(applyUrl, {
            headers: { Accept: 'text/html', 'User-Agent': 'SpeakingOpportunityFinder/1.0' },
          });
          if (detailResponse.ok) {
            const detailHtml = await detailResponse.text();
            cfpDeadline = extractDeadline(detailHtml);
          }
        } catch {
          // ignore detail fetch failures
        }
      }

      results.push({
        title: `${title} - Call for Speakers`,
        organization: title,
        description: `Event listed on pac.org.`,
        location: null,
        isRemote: false,
        eventDate: date,
        cfpDeadline,
        format: 'conference',
        industries: ['public affairs'],
        compensationType: undefined,
        compensationDetails: undefined,
        applyUrl,
        source: 'pac.org',
        sourceUrl: url,
      });
    }
  } catch {
    return results;
  }

  return results;
}
