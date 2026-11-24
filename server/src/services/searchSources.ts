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

/**
 * Curated event calendars read on a schedule (scrapers/calendars/). A
 * calendar vouches that an event exists, not that it wants speakers, so its
 * rows are links like any other: hidden until the event's own page is read.
 * The source is the calendar's site, which is the credit Civic Tech Field
 * Guide's CC BY licence asks for.
 */
export const CALENDAR_SOURCES = {
  tradeShowCalendar: 'thetradeshowcalendar.com',
  civicTechGuide: 'civictech.guide',
  worldDesignOrganization: 'wdo.org',
} as const;

/** Sources whose rows were reached by a link from another page, not by a search. */
const LINKED_SOURCES: readonly string[] = [FOLLOWED_LINK_SOURCE, ...Object.values(CALENDAR_SOURCES)];

export const SEARCH_SOURCES: readonly string[] = [LIVE_SEARCH_SOURCE, LINKUP_SEARCH_SOURCE, ...LINKED_SOURCES];

export function isSearchSource(source: string): boolean {
  return SEARCH_SOURCES.includes(source);
}

/**
 * A row reached by a link (a followed link or a calendar's entry): it is read
 * only when robots.txt allows every crawler, and never fans out a directory.
 */
export function isFollowedLink(source: string): boolean {
  return LINKED_SOURCES.includes(source);
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
