import type { ScraperResult } from './index.js';
import { cleanTitle, normalizeIndustries } from '../services/dataNormalization.js';

/**
 * Scrapes WikiCFP for academic and professional conference CFPs.
 * Uses their RSS/Atom feed which provides structured data without HTML parsing.
 */

const WIKICFP_URL = 'http://www.wikicfp.com/cfp/rss?cat=all';

// Category-specific feeds for broader coverage
const WIKICFP_FEEDS = [
  { url: 'http://www.wikicfp.com/cfp/rss?cat=computer+science', industries: ['technology', 'computer science'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=artificial+intelligence', industries: ['technology', 'AI', 'machine learning'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=data+science', industries: ['technology', 'data science'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=security', industries: ['technology', 'cybersecurity'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=engineering', industries: ['engineering'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=education', industries: ['education'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=healthcare', industries: ['healthcare'] },
  { url: 'http://www.wikicfp.com/cfp/rss?cat=business', industries: ['business'] },
];

function parseRSSItems(xmlText: string): Array<{
  title: string;
  link: string;
  description: string;
}> {
  const items: Array<{ title: string; link: string; description: string }> = [];

  // Simple XML parsing for RSS items (avoids needing an XML parser dependency)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];

    const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
    const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/);

    const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    const description = descMatch ? (descMatch[1] || descMatch[2] || '').trim() : '';

    if (title && link) {
      items.push({ title, link, description });
    }
  }

  return items;
}

function extractDeadline(description: string): Date | undefined {
  // WikiCFP descriptions often contain deadline info like "Submission Deadline: March 15, 2026"
  const patterns = [
    /(?:deadline|submission)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i,
    /(?:deadline|submission)[:\s]*(\d{4}-\d{2}-\d{2})/i,
    /(\d{1,2}\s+\w+\s+\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime()) && parsed > new Date()) {
        return parsed;
      }
    }
  }

  return undefined;
}

function extractLocation(description: string): string | null {
  // Look for location patterns in description
  const match = description.match(/(?:location|venue|held in|place)[:\s]*([^,\n.]+(?:,\s*[A-Z][a-z]+)?)/i);
  if (match) {
    return match[1].trim();
  }
  return null;
}

function mapToScraperResult(
  item: { title: string; link: string; description: string },
  industries: string[]
): ScraperResult | null {
  if (!item.link) return null;

  const deadline = extractDeadline(item.description);

  // Skip if we found a deadline and it's in the past
  if (deadline && deadline < new Date()) {
    return null;
  }

  const location = extractLocation(item.description);
  const isRemote = item.description.toLowerCase().includes('online') ||
    item.description.toLowerCase().includes('virtual');

  // Clean up description: strip HTML tags
  const cleanDescription = item.description
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .substring(0, 500);

  return {
    title: cleanTitle(item.title),
    organization: item.title,
    description: cleanDescription || `Submit your paper to ${item.title}.`,
    location,
    isRemote,
    eventDate: undefined,
    cfpDeadline: deadline,
    format: 'conference',
    industries: normalizeIndustries(industries),
    compensationType: undefined,
    compensationDetails: undefined,
    applyUrl: item.link,
    source: 'wikicfp.com',
    sourceUrl: item.link,
  };
}

export async function scrapeWikiCFP(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  const seenUrls = new Set<string>();

  console.log('Fetching CFPs from WikiCFP...');

  for (const feed of WIKICFP_FEEDS) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'SpeakingOpportunityFinder/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        console.log(`WikiCFP feed ${feed.url} returned ${response.status}, skipping...`);
        continue;
      }

      const xmlText = await response.text();
      const items = parseRSSItems(xmlText);

      for (const item of items) {
        if (seenUrls.has(item.link)) continue;

        const result = mapToScraperResult(item, feed.industries);
        if (result) {
          results.push(result);
          seenUrls.add(item.link);
        }
      }

      // Small delay between feed requests
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`Error fetching WikiCFP feed ${feed.url}:`, error);
    }
  }

  console.log(`Found ${results.length} CFPs from WikiCFP`);
  return results;
}
