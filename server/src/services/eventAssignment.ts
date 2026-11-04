import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import {
  AUTO_LINK_SCORE,
  classifyScore,
  deriveEditionYear,
  displayName,
  eventDomain,
  lookupTokens,
  nameTokens,
  normalizeEventName,
  scoreCandidate,
  slugify,
  type MatchCandidate,
} from './eventMatching.js';

/**
 * The database side of event matching: find the canonical `Event` a row is an
 * edition of, or create one, and stamp `eventId` / `editionYear` on the row.
 * Scraper persistence, live-search persistence and the backfill script all
 * call `assignEvent`; the scoring itself lives in `eventMatching.ts`.
 */

/** A `PrismaClient` or the client of an interactive transaction. */
export type EventDb = Prisma.TransactionClient;

export interface AssignableOpportunity {
  id: string;
  title: string;
  organization: string | null;
  applyUrl: string;
  eventDate: Date | null;
  location: string | null;
  /** The event the row already belongs to, if any; it keeps it unless a better one scores as a match. */
  eventId?: string | null;
}

export type AssignmentOutcome =
  /** Linked to an existing event with a score at or above AUTO_LINK_SCORE. */
  | 'linked'
  /** A new event; nothing stored looked alike. */
  | 'created'
  /** A new event, with the closest existing one recorded as a possible duplicate. */
  | 'created-possible'
  /** The title normalizes to nothing and the URL is on a shared platform: no event. */
  | 'unmatchable';

export interface AssignmentResult {
  opportunityId: string;
  outcome: AssignmentOutcome;
  eventId: string | null;
  editionYear: number | null;
  /** Score against the chosen (linked) or closest (possible) event; 0 when none was found. */
  score: number;
  possibleEventId: string | null;
}

const CANDIDATE_LIMIT = 200;
const SLUG_RETRIES = 50;

type CandidateEvent = Prisma.EventGetPayload<{
  include: { editions: { select: { title: true; organization: true; applyUrl: true; eventDate: true; location: true } } };
}>;

function asCandidate(row: AssignableOpportunity): MatchCandidate {
  return {
    title: row.title,
    organization: row.organization,
    applyUrl: row.applyUrl,
    eventDate: row.eventDate,
    location: row.location,
  };
}

/**
 * The best score of a row against any edition of an event. Only an event with
 * no editions left is scored by its own name: an edition carries the city and
 * acronym the auto-link gate needs, the bare name does not.
 */
export function scoreAgainstEvent(row: MatchCandidate, event: CandidateEvent): number {
  if (event.editions.length === 0) {
    return scoreCandidate(row, {
      title: event.canonicalName,
      organization: event.organizer,
      applyUrl: event.domain ? `https://${event.domain}/` : '',
      eventDate: null,
      location: null,
    });
  }
  return event.editions.reduce((best, edition) => Math.max(best, scoreCandidate(row, edition)), 0);
}

async function findCandidates(db: EventDb, row: AssignableOpportunity): Promise<CandidateEvent[]> {
  const tokens = lookupTokens(row.title);
  const domain = eventDomain(row.applyUrl);
  const or: Prisma.EventWhereInput[] = [];
  if (tokens.length > 0) or.push({ nameTokens: { hasSome: tokens } });
  if (domain) or.push({ domain });
  if (or.length === 0) return [];
  return db.event.findMany({
    where: { OR: or },
    include: { editions: { select: { title: true, organization: true, applyUrl: true, eventDate: true, location: true } } },
    take: CANDIDATE_LIMIT,
  });
}

function organizerOf(row: AssignableOpportunity): string | null {
  if (!row.organization) return null;
  return normalizeEventName(row.organization) === normalizeEventName(row.title) ? null : row.organization.trim();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Slugs to try, most specific first: the title alone, then the title with the
 * organizer or the site's domain label (generic titles such as "Annual
 * Conference" recur across many organizers), then numeric suffixes.
 */
function slugCandidates(row: AssignableOpportunity, baseSlug: string): string[] {
  const domainLabel = eventDomain(row.applyUrl)?.split('.')[0] ?? null;
  const qualifiers = [organizerOf(row), domainLabel]
    .map((value) => (value ? slugify(value) : ''))
    .filter((value) => value && !baseSlug.includes(value));
  const named = [...new Set(qualifiers)].map((qualifier) => `${baseSlug}-${qualifier}`);
  const numbered = Array.from({ length: SLUG_RETRIES }, (_, index) => `${baseSlug}-${index + 2}`);
  return [baseSlug, ...named, ...numbered];
}

async function createEvent(db: EventDb, row: AssignableOpportunity, now: Date): Promise<{ id: string } | 'collision'> {
  const baseSlug = slugify(row.title);
  const data = {
    canonicalName: displayName(row.title),
    organizer: organizerOf(row),
    domain: eventDomain(row.applyUrl),
    aliases: [displayName(row.title)],
    nameTokens: nameTokens(row.title),
    firstSeenAt: now,
    lastSeenAt: now,
  };
  const candidates = slugCandidates(row, baseSlug);
  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const slug = candidates[attempt];
    // Look before inserting: a unique violation inside a Postgres transaction
    // aborts the whole transaction (25P02), so the backfill's dry run cannot
    // recover from one. The catch below only covers a concurrent insert that
    // lands between the lookup and the create, outside any transaction.
    const taken = await db.event.findUnique({
      where: { slug },
      include: { editions: { select: { title: true, organization: true, applyUrl: true, eventDate: true, location: true } } },
    });
    if (taken) {
      // The slug belongs to the same event: link to it instead of suffixing.
      if (attempt === 0 && scoreAgainstEvent(asCandidate(row), taken) >= AUTO_LINK_SCORE) return 'collision';
      continue;
    }
    try {
      return await db.event.create({ data: { ...data, slug }, select: { id: true } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error(`Could not find a free slug for event "${baseSlug}" after ${candidates.length} attempts`);
}

async function linkToEvent(db: EventDb, row: AssignableOpportunity, event: CandidateEvent, now: Date): Promise<void> {
  const alias = displayName(row.title);
  const tokens = nameTokens(row.title);
  await db.event.update({
    where: { id: event.id },
    data: {
      lastSeenAt: now,
      domain: event.domain ?? eventDomain(row.applyUrl),
      organizer: event.organizer ?? organizerOf(row),
      aliases: event.aliases.includes(alias) ? undefined : { push: alias },
      nameTokens: tokens.every((t) => event.nameTokens.includes(t))
        ? undefined
        : [...new Set([...event.nameTokens, ...tokens])],
    },
  });
}

/**
 * Find or create the event for one row and stamp it. Safe to call again on a
 * row that already has an event (it is re-evaluated, not duplicated) and on a
 * row no event fits (only `editionYear` is set).
 */
export async function assignEvent(
  db: EventDb,
  row: AssignableOpportunity,
  now: Date = new Date(),
  options: { afterCollision?: boolean } = {}
): Promise<AssignmentResult> {
  const editionYear = deriveEditionYear(row);
  const candidate = asCandidate(row);
  // A row re-evaluated later must not match itself, but may still match its own event's other editions.
  const candidates = (await findCandidates(db, row)).map((event) => ({
    ...event,
    editions: event.editions.filter((edition) => edition.applyUrl !== row.applyUrl),
  }));

  let best: { event: CandidateEvent; score: number } | null = null;
  for (const event of candidates) {
    // The row's current event is kept unless another one scores as a match outright.
    const score = event.id === row.eventId ? Math.max(AUTO_LINK_SCORE, scoreAgainstEvent(candidate, event)) : scoreAgainstEvent(candidate, event);
    if (!best || score > best.score) best = { event, score };
  }

  const band = best ? classifyScore(best.score) : 'none';
  if (best && band === 'auto') {
    await linkToEvent(db, row, best.event, now);
    await db.opportunity.update({
      where: { id: row.id },
      data: { eventId: best.event.id, editionYear, possibleEventId: null, possibleEventScore: null },
    });
    return { opportunityId: row.id, outcome: 'linked', eventId: best.event.id, editionYear, score: best.score, possibleEventId: null };
  }

  if (!normalizeEventName(row.title)) {
    await db.opportunity.update({ where: { id: row.id }, data: { editionYear } });
    return { opportunityId: row.id, outcome: 'unmatchable', eventId: null, editionYear, score: 0, possibleEventId: null };
  }

  const created = await createEvent(db, row, now);
  if (created === 'collision') {
    if (options.afterCollision) throw new Error(`Event slug "${slugify(row.title)}" collided twice for "${row.title}"`);
    return assignEvent(db, row, now, { afterCollision: true });
  }

  const possible = best && band === 'review' ? best : null;
  await db.opportunity.update({
    where: { id: row.id },
    data: {
      eventId: created.id,
      editionYear,
      possibleEventId: possible?.event.id ?? null,
      possibleEventScore: possible?.score ?? null,
    },
  });
  return {
    opportunityId: row.id,
    outcome: possible ? 'created-possible' : 'created',
    eventId: created.id,
    editionYear,
    score: possible?.score ?? 0,
    possibleEventId: possible?.event.id ?? null,
  };
}

/** Assign events to several freshly stored rows; one failure never blocks the others. */
export async function assignEvents(
  db: PrismaClient,
  rows: AssignableOpportunity[],
  now: Date = new Date()
): Promise<AssignmentResult[]> {
  const results: AssignmentResult[] = [];
  for (const row of rows) {
    try {
      results.push(await assignEvent(db, row, now));
    } catch (error) {
      console.error(`[Events] Could not assign an event to "${row.title}":`, error instanceof Error ? error.message : error);
    }
  }
  return results;
}
