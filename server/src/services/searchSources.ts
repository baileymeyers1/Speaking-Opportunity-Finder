/**
 * Rows found by a web search, as opposed to rows a CFP listing vouches for.
 *
 * A CFP listing (confs.tech, Sessionize, Pretalx, …) states that a call
 * exists and when it closes. A search hit states nothing: it is a URL and a
 * snippet. So a search hit counts only once its own page has been read, and
 * what that page says decides whether it is an event at all.
 */

/** Hits a visitor's live search stored (see liveSearchService). */
export const LIVE_SEARCH_SOURCE = 'Live Search';
/** Hits the scheduled Linkup queries stored (see scrapers/linkupcfp.ts). */
export const LINKUP_SEARCH_SOURCE = 'Linkup Search';
/**
 * Pages a read page linked to: an event's own site named by a listing, or
 * the events a directory lists (services/followedLinks.ts). Like a search
 * hit, a link is only an address and a name until its page is read.
 */
export const FOLLOWED_LINK_SOURCE = 'Followed Link';

export const SEARCH_SOURCES: readonly string[] = [LIVE_SEARCH_SOURCE, LINKUP_SEARCH_SOURCE, FOLLOWED_LINK_SOURCE];

export function isSearchSource(source: string): boolean {
  return SEARCH_SOURCES.includes(source);
}

export function isFollowedLink(source: string): boolean {
  return source === FOLLOWED_LINK_SOURCE;
}

export interface ReadState {
  source: string;
  enrichmentStatus: string | null;
  verifiedAt: Date | null;
  verificationError: string | null;
}

/**
 * A search hit whose page has not been read, or could not be read at the last
 * check. Such a row is never listed (`UNREAD_SEARCH_HIT` in opportunityQuery
 * is the same rule as a query).
 */
export function isUnreadSearchHit(row: ReadState): boolean {
  if (!isSearchSource(row.source)) return false;
  return row.enrichmentStatus !== 'enriched' || row.verifiedAt === null || row.verificationError !== null;
}

/**
 * Whether a call is open, after a page read. For a search hit the page is the
 * only evidence, so its answer stands. For a listed call the listing is the
 * evidence: the page can confirm it, but a page that does not mention the
 * call (an event home page, a form behind a login) does not deny it, so the
 * answer goes back to "not judged", which is read as open.
 */
export function openCallAfterRead(source: string, read: { isRelevant: boolean; hasOpenCall: boolean }): boolean | null {
  if (!read.isRelevant) return false;
  if (isSearchSource(source)) return read.hasOpenCall;
  return read.hasOpenCall ? true : null;
}
