import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { normalizeIndustries } from './dataNormalization.js';
import { mapWithConcurrency } from '../scrapers/lib/html.js';
import { calendarDate, instantInZone, isDeadlinePast, isValidTimezone } from '../lib/deadlines.js';
import type { ScraperResult } from '../scrapers/qualityScore.js';

/**
 * The one Claude call that reads a speaking-opportunity page (or its listing
 * text) and returns typed facts. Both the enrichment worker and live search go
 * through here, so the prompt, the JSON schema and the merge rules live in one
 * place. The response is constrained with structured outputs, so the shape is
 * guaranteed by the API; `parseExtractionOutput` still validates values (dates,
 * enums) because the model can emit a well-formed but impossible date.
 */

export type Confidence = 'high' | 'medium' | 'low';
export const CONFIDENCE_LEVELS: readonly Confidence[] = ['high', 'medium', 'low'];

export const COMPENSATION_TYPES = ['paid', 'travel', 'honorarium', 'exposure'] as const;
export type CompensationType = (typeof COMPENSATION_TYPES)[number];

export const OPPORTUNITY_FORMATS = ['conference', 'meetup', 'podcast', 'webinar', 'workshop', 'panel', 'other'] as const;
export type OpportunityFormat = (typeof OPPORTUNITY_FORMATS)[number];

export interface DateConfidence {
  eventDate: Confidence;
  cfpDeadline: Confidence;
  location: Confidence;
}

export interface ExtractionResult {
  eventDate: Date | null;
  /** The instant the call closes: the stated day (and time, when given) in `deadlineTimezone`, AoE when none. */
  cfpDeadline: Date | null;
  /** IANA zone or `AoE` the page stated the deadline in; null when it stated none. */
  deadlineTimezone: string | null;
  location: string | null;
  isRemote: boolean;
  isClosed: boolean;
  isRelevant: boolean;
  compensationType: CompensationType | null;
  compensationAmount: number | null;
  format: OpportunityFormat;
  industries: string[];
  cleanTitle: string | null;
  cleanOrganization: string | null;
  confidence: DateConfidence;
}

export interface ExtractionInput {
  title: string;
  organization?: string | null;
  /** Listing text from the scraper or search result. */
  description?: string | null;
  /** Visible text of the apply page, when it could be fetched. */
  pageText?: string | null;
  applyUrl?: string | null;
}

export type ExtractionOutcome =
  | { status: 'ok'; result: ExtractionResult }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

const nullableString = { type: ['string', 'null'] } as const;
const confidenceSchema = { type: 'string', enum: [...CONFIDENCE_LEVELS] } as const;

/** JSON schema sent as `output_config.format`; mirrors ExtractionResult with ISO date strings. */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'eventDate',
    'cfpDeadline',
    'cfpDeadlineTime',
    'deadlineTimezone',
    'location',
    'isRemote',
    'isClosed',
    'isRelevant',
    'compensationType',
    'compensationAmount',
    'format',
    'industries',
    'cleanTitle',
    'cleanOrganization',
    'confidence',
  ],
  properties: {
    eventDate: { ...nullableString, description: 'Start date of the event as YYYY-MM-DD, or null when not stated.' },
    cfpDeadline: {
      ...nullableString,
      description: 'Date proposals must be submitted by, as YYYY-MM-DD. Null when not stated or rolling.',
    },
    cfpDeadlineTime: {
      ...nullableString,
      description: 'Closing time on the deadline day as 24-hour HH:MM when the page states one (23:59, 17:00). Null when only a date is given.',
    },
    deadlineTimezone: {
      ...nullableString,
      description:
        'Timezone the deadline is stated in: an IANA name such as America/New_York, or AoE for Anywhere on Earth. Null when the page states none; never inferred.',
    },
    location: { ...nullableString, description: 'Where the event physically happens, as "City, ST" or "City, Country".' },
    isRemote: { type: 'boolean' },
    isClosed: { type: 'boolean' },
    isRelevant: { type: 'boolean' },
    compensationType: { anyOf: [{ type: 'string', enum: [...COMPENSATION_TYPES] }, { type: 'null' }] },
    compensationAmount: { type: ['integer', 'null'], description: 'Speaker fee or stipend in USD when a figure is given.' },
    format: { type: 'string', enum: [...OPPORTUNITY_FORMATS] },
    industries: { type: 'array', items: { type: 'string' }, description: 'Up to 5 short lowercase topic tags.' },
    cleanTitle: nullableString,
    cleanOrganization: nullableString,
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['eventDate', 'cfpDeadline', 'location'],
      properties: { eventDate: confidenceSchema, cfpDeadline: confidenceSchema, location: confidenceSchema },
    },
  },
} as const;

export const MAX_DESCRIPTION_CHARS = 1200;
export const MAX_PAGE_TEXT_CHARS = 5000;

export function buildExtractionPrompt(input: ExtractionInput, now: Date = new Date()): string {
  const todayStr = now.toISOString().split('T')[0];
  const thisYear = now.getUTCFullYear();
  const nextYear = thisYear + 1;
  const description = (input.description || '').trim().slice(0, MAX_DESCRIPTION_CHARS);
  const pageText = (input.pageText || '').trim().slice(0, MAX_PAGE_TEXT_CHARS);

  return `You extract facts about a speaking opportunity (a call for speakers, papers, proposals, panelists or podcast guests) from the text of its web page and listing.

Today's date is ${todayStr}. If a date has no year, assume ${thisYear} if that month has not passed yet, otherwise ${nextYear}.

Rules:
- cfpDeadline is the date speaker proposals or abstracts must be SUBMITTED. eventDate is the START date of the event itself. Never confuse the two: "Proposals due September 21, ${thisYear}" for an event on "May 4-6, ${nextYear}" means cfpDeadline ${thisYear}-09-21 and eventDate ${nextYear}-05-04.
- A "rolling" or "ongoing" deadline is null. Do not invent dates that are not in the text.
- cfpDeadlineTime is the closing time on that day when the page states one, as 24-hour HH:MM ("11:59 PM" is 23:59, "5pm" is 17:00). Null when only a date is given.
- deadlineTimezone is the timezone the deadline is stated in, as an IANA name ("America/New_York", "Europe/Berlin", "UTC"), or "AoE" when the page says "Anywhere on Earth", "AoE" or "UTC-12". Convert a stated abbreviation to the IANA name it denotes ("PST" is America/Los_Angeles, "CET" is Europe/Berlin); null when the abbreviation is ambiguous. Null when the page states no timezone: never infer it from the venue, the organizer or the country.
- location is where the event physically takes place, not the organizer's headquarters. Null when fully online or not stated.
- isRemote is true when the event is virtual or offers remote attendance or remote speaking.
- isClosed is true when the call for speakers is explicitly closed or no longer accepting submissions, when the event is cancelled or already past, when the deadline is before ${todayStr}, or when the page is an error or "not found" page.
- isRelevant is true only when the page is a genuine opportunity to speak or present. False for job postings, attendee registration, sponsorship pages, news articles and unrelated pages.
- compensationType: "paid" (speaker fee or stipend), "travel" (travel or hotel covered), "honorarium", "exposure" (explicitly unpaid), or null when not stated. compensationAmount is the USD figure when one is given.
- format: conference, meetup, podcast, webinar, workshop, panel, or other.
- industries: up to 5 short lowercase topic tags such as "healthcare", "ai", "devops".
- cleanTitle is the event name without suffixes like "Call for Speakers" or "| Company Name"; keep the year if it is part of the name. cleanOrganization is the body running the event, not the event name. Null when unknown.
- confidence: "high" when the value is stated explicitly, "medium" when inferred (for example an assumed year), "low" when guessed from weak cues. For a null value, report how sure you are that the text does not state it.

Title: ${input.title}
Organization: ${input.organization || 'unknown'}
URL: ${input.applyUrl || 'unknown'}

Listing text:
${description || '(none)'}

Page text:
${pageText || '(the page could not be fetched; use the listing text)'}`;
}

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!config.claude.apiKey) return null;
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: config.claude.apiKey,
      timeout: 30_000,
      maxRetries: 1,
    });
  }
  return anthropic;
}

/** Parse a YYYY-MM-DD string to UTC midnight; undefined when absent or impossible. */
function parseIsoDate(value: unknown): Date | null | undefined {
  if (value === null || value === undefined || value === '' || value === 'null') return null;
  if (typeof value !== 'string') return undefined;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (isNaN(date.getTime())) return undefined;
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 2100) return undefined;
  return date;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
}

/**
 * The deadline instant from the model's date, optional time and zone. The
 * calendar day is validated like every other date; a time the model got wrong
 * falls back to end of day rather than losing the deadline. Null when absent,
 * undefined when the date is impossible.
 */
function parseDeadline(date: unknown, time: string | null, zone: string | null): Date | null | undefined {
  const day = parseIsoDate(date);
  if (!day) return day;
  const dateOnly = calendarDate(day);
  return instantInZone(dateOnly, time, zone) ?? instantInZone(dateOnly, null, zone) ?? undefined;
}

function confidenceOf(value: unknown): Confidence {
  return CONFIDENCE_LEVELS.includes(value as Confidence) ? (value as Confidence) : 'low';
}

export type ParsedExtraction = { ok: true; result: ExtractionResult } | { ok: false; error: string };

/**
 * Validate the model's JSON into an ExtractionResult. Invalid dates are
 * dropped (null) rather than failing the whole extraction; a value that is
 * not an object at all fails.
 */
export function parseExtractionOutput(raw: unknown): ParsedExtraction {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Extraction output is not an object' };
  }
  const data = raw as Record<string, unknown>;

  const eventDate = parseIsoDate(data.eventDate);
  const statedZone = optionalString(data.deadlineTimezone);
  const deadlineTimezone = isValidTimezone(statedZone) ? statedZone : null;
  const cfpDeadline = parseDeadline(data.cfpDeadline, optionalString(data.cfpDeadlineTime), deadlineTimezone);
  const confidence = (data.confidence && typeof data.confidence === 'object'
    ? data.confidence
    : {}) as Record<string, unknown>;

  const compensationType = COMPENSATION_TYPES.includes(data.compensationType as CompensationType)
    ? (data.compensationType as CompensationType)
    : null;
  const format = OPPORTUNITY_FORMATS.includes(data.format as OpportunityFormat)
    ? (data.format as OpportunityFormat)
    : 'other';
  const amount = typeof data.compensationAmount === 'number' && Number.isFinite(data.compensationAmount) && data.compensationAmount > 0
    ? Math.round(data.compensationAmount)
    : null;

  return {
    ok: true,
    result: {
      eventDate: eventDate ?? null,
      cfpDeadline: cfpDeadline ?? null,
      deadlineTimezone: cfpDeadline ? deadlineTimezone : null,
      location: optionalString(data.location),
      isRemote: data.isRemote === true,
      isClosed: data.isClosed === true,
      isRelevant: data.isRelevant !== false,
      compensationType,
      compensationAmount: amount,
      format,
      industries: Array.isArray(data.industries)
        ? normalizeIndustries(data.industries.filter((tag): tag is string => typeof tag === 'string'))
        : [],
      cleanTitle: optionalString(data.cleanTitle),
      cleanOrganization: optionalString(data.cleanOrganization),
      confidence: {
        // An invalid date string means the model was not confident in practice.
        eventDate: eventDate === undefined ? 'low' : confidenceOf(confidence.eventDate),
        cfpDeadline: cfpDeadline === undefined ? 'low' : confidenceOf(confidence.cfpDeadline),
        location: confidenceOf(confidence.location),
      },
    },
  };
}

/**
 * Run the extraction call. The caller is responsible for budget accounting
 * (reserve a slot before calling; every request is billed).
 */
export async function extractOpportunity(
  input: ExtractionInput,
  options: { now?: Date } = {}
): Promise<ExtractionOutcome> {
  const client = getAnthropicClient();
  if (!client) return { status: 'skipped', reason: 'ANTHROPIC_API_KEY not configured' };

  try {
    const message = await client.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      // Extraction is simple; keep reasoning spend minimal.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [{ role: 'user', content: buildExtractionPrompt(input, options.now) }],
    });

    if (message.stop_reason === 'max_tokens') {
      return { status: 'failed', error: `Response truncated at ${config.claude.maxTokens} tokens` };
    }
    if (message.stop_reason !== 'end_turn' && message.stop_reason !== 'stop_sequence') {
      return { status: 'failed', error: `Unexpected stop_reason: ${message.stop_reason}` };
    }

    // Models with thinking enabled may return a thinking block first.
    const textBlock = message.content.find((block) => block.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    if (!text) return { status: 'failed', error: 'No text block in response' };

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      return { status: 'failed', error: `Invalid JSON: ${error instanceof Error ? error.message : 'parse error'}` };
    }

    const parsed = parseExtractionOutput(json);
    return parsed.ok ? { status: 'ok', result: parsed.result } : { status: 'failed', error: parsed.error };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'Unknown extraction error' };
  }
}

/** Extract several inputs with bounded concurrency. Results keep input order. */
export function extractOpportunitiesBatch(
  inputs: readonly ExtractionInput[],
  concurrency: number = 5,
  options: { now?: Date } = {}
): Promise<ExtractionOutcome[]> {
  return mapWithConcurrency(inputs, concurrency, (input) => extractOpportunity(input, options));
}

export interface MergedOpportunity extends ScraperResult {
  isClosed: boolean;
  isRelevant: boolean;
  dateConfidence: DateConfidence;
}

/**
 * Merge an extraction into the row we already have.
 *
 * Claude read the actual page, so its non-null values overwrite scraped or
 * regex-derived ones; a null means "not stated" and keeps what we had.
 * Industries are replaced when the model returned any. The listing is closed
 * when the model says so or when the merged deadline instant is already past
 * (a legacy midnight-UTC deadline is read as AoE end of day, see
 * lib/deadlines.ts). The deadline's zone travels with the deadline: an
 * extracted deadline brings its own zone (or none), a kept one keeps its own.
 * Low-confidence dates are kept; the confidence is returned so the UI can
 * show them as approximate.
 */
export function mergeExtraction(
  existing: ScraperResult,
  extraction: ExtractionResult,
  now: Date = new Date()
): MergedOpportunity {
  const cfpDeadline = extraction.cfpDeadline ?? existing.cfpDeadline;
  const deadlineTimezone = extraction.cfpDeadline ? extraction.deadlineTimezone : (existing.deadlineTimezone ?? null);
  const deadlinePassed = isDeadlinePast({ cfpDeadline, deadlineTimezone }, now);

  return {
    ...existing,
    title: extraction.cleanTitle ?? existing.title,
    organization: extraction.cleanOrganization ?? existing.organization,
    location: extraction.location ?? existing.location,
    isRemote: extraction.isRemote,
    eventDate: extraction.eventDate ?? existing.eventDate,
    cfpDeadline,
    deadlineTimezone,
    format: extraction.format,
    industries: extraction.industries.length > 0 ? extraction.industries : existing.industries,
    compensationType: extraction.compensationType ?? existing.compensationType,
    compensationAmount: extraction.compensationAmount ?? existing.compensationAmount,
    isClosed: extraction.isClosed || deadlinePassed,
    isRelevant: extraction.isRelevant,
    dateConfidence: extraction.confidence,
  };
}

export function serializeDateConfidence(confidence: DateConfidence | null | undefined): string | null {
  return confidence ? JSON.stringify(confidence) : null;
}

export function parseDateConfidence(value: string | null | undefined): DateConfidence | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      eventDate: confidenceOf(parsed.eventDate),
      cfpDeadline: confidenceOf(parsed.cfpDeadline),
      location: confidenceOf(parsed.location),
    };
  } catch {
    return null;
  }
}
