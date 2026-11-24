import { prisma } from '../lib/prisma.js';
import { buildCreateData } from '../scrapers/persistData.js';
import type { ExtractionResult, ListedEvent } from './extraction.js';
import { looksLikeArticle } from './liveHitTriage.js';
import { FOLLOWED_LINK_SOURCE, isFollowedLink } from './searchSources.js';

/**
 * Pages a read page points to, stored as rows for the worker to read: the
 * event's own site when the page was a listing of it elsewhere
 * (`officialUrl`), and the events a directory or calendar lists
 * (`listedEvents`). A link is an address and a name, nothing more, so the row
 * is hidden until its own page is read (FOLLOWED_LINK_SOURCE is a search
 * source). The page it came from is kept in `sourceUrl`.
 *
 * One hop of fan-out: a directory found by search queues its events, but a
 * page reached by a followed link never queues another directory's worth.
 * It may still name its own site. Addresses already stored are skipped, so
 * nothing is queued twice and a cycle ends at the first repeat.
 */

export interface LinkingPage {
  applyUrl: string;
  source: string;
  title: string;
}

export interface FollowedLinksDb {
  opportunity: {
    findMany(args: { where: { applyUrl: { in: string[] } }; select: { applyUrl: true } }): Promise<Array<{ applyUrl: string }>>;
    createMany(args: { data: ReturnType<typeof buildCreateData>[]; skipDuplicates: true }): Promise<{ count: number }>;
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** What a read page points to that is worth a row: deduplicated, never the page itself, never an article, social or pay-to-present aggregator page. */
export function linksToFollow(from: LinkingPage, extraction: ExtractionResult): ListedEvent[] {
  const candidates: ListedEvent[] = [];
  if (extraction.officialUrl) candidates.push({ name: extraction.cleanTitle ?? from.title, url: extraction.officialUrl });
  if (!isFollowedLink(from.source)) candidates.push(...(extraction.listedEvents ?? []));

  const seen = new Set<string>([from.applyUrl]);
  return candidates.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return !looksLikeArticle({ title: link.name, description: null, applyUrl: link.url });
  });
}

/** Stores the links a read found as unread rows; returns how many were new. */
export async function queueFollowedLinks(
  from: LinkingPage,
  extraction: ExtractionResult,
  db: FollowedLinksDb = prisma as unknown as FollowedLinksDb
): Promise<number> {
  const links = linksToFollow(from, extraction);
  if (links.length === 0) return 0;

  const stored = await db.opportunity.findMany({ where: { applyUrl: { in: links.map((link) => link.url) } }, select: { applyUrl: true } });
  const known = new Set(stored.map((row) => row.applyUrl));
  const fresh = links.filter((link) => !known.has(link.url));
  if (fresh.length === 0) return 0;

  const data = fresh.map((link) =>
    buildCreateData({
      title: link.name,
      organization: hostOf(link.url),
      description: `Linked from ${hostOf(from.applyUrl)}: ${from.title}`,
      isRemote: false,
      format: 'other',
      industries: [],
      applyUrl: link.url,
      source: FOLLOWED_LINK_SOURCE,
      sourceUrl: from.applyUrl,
    })
  );
  const { count } = await db.opportunity.createMany({ data, skipDuplicates: true });
  if (count > 0) console.log(`[FollowedLinks] ${hostOf(from.applyUrl)}: queued ${count} linked page${count === 1 ? '' : 's'}`);
  return count;
}
