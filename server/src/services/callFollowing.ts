import type { ExtractionInput, ExtractionOutcome, ExtractionResult, MergedOpportunity } from './extraction.js';
import { mergeExtraction } from './extraction.js';
import type { PageReadResult } from './pageReader.js';

/**
 * An event's page often says nothing about speaking while its menu has a
 * "Call for Speakers" link one click away. Read as it is, such an event is
 * listed as one "to watch" (no open call) and every weekly check says so
 * again. When the read names the call page (`callPageUrl`, one of the page's
 * own links), that page is read too, once, in the same read: the worker's
 * first read, every verification, and a live search's reads in the request.
 *
 * The call page only replaces what the first read found when it holds an open
 * call; the row then applies at `callUrl`, and `applyUrl` stays the event's
 * address (scrapers and searches find rows by it). A call page that is closed
 * or not about the event changes nothing: it may be last year's call.
 */

export interface PageExtraction {
  merged: MergedOpportunity;
  extraction: ExtractionResult;
}

export interface FollowDeps {
  readPage: (url: string) => Promise<PageReadResult>;
  extract: (input: ExtractionInput, options: { now?: Date }) => Promise<ExtractionOutcome>;
  /** Takes one Claude call from the budget; false when none is left. */
  reserveCall: () => Promise<boolean>;
  /** Gives back a reserved call the API did not take. */
  releaseCall: () => Promise<void>;
  now: Date;
}

/** The read found the event, no open call on its page, and named the page the call is on. */
export function shouldFollowCall({ merged, extraction }: PageExtraction): boolean {
  return extraction.isRelevant && !extraction.hasOpenCall && !merged.isClosed && Boolean(extraction.callPageUrl);
}

/**
 * What the row should say after its call page is read, or the first read's
 * answer when there is nothing to follow. A page that already says the call is
 * open and names the page to submit on applies there without another read
 * (pes-gm.org: "call for papers open", submissions on /2027-call-for-papers).
 */
export async function followCallPage(first: PageExtraction, deps: FollowDeps): Promise<MergedOpportunity> {
  if (first.extraction.isRelevant && first.extraction.hasOpenCall && !first.merged.isClosed && first.extraction.callPageUrl) {
    return { ...first.merged, callUrl: first.extraction.callPageUrl };
  }
  if (!shouldFollowCall(first)) return first.merged;
  const url = first.extraction.callPageUrl!;

  const page = await deps.readPage(url);
  if (!page.ok) return first.merged;
  if (!(await deps.reserveCall())) return first.merged;

  const outcome = await deps.extract(
    { title: first.merged.title, organization: first.merged.organization, pageText: page.text, links: page.links, applyUrl: url },
    { now: deps.now }
  );
  if (outcome.status !== 'ok') {
    if (outcome.status === 'skipped') await deps.releaseCall();
    return first.merged;
  }

  const call = outcome.result;
  const merged = mergeExtraction(first.merged, call, deps.now);
  if (!call.isRelevant || !call.hasOpenCall || merged.isClosed) return first.merged;
  return { ...merged, isRelevant: true, hasOpenCall: true, callUrl: url };
}
