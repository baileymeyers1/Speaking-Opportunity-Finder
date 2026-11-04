/**
 * Admin analytics wire types (`GET /api/admin/analytics/*` and the manual
 * actions). Re-exported from `types.ts`, so both sides import from `shared`.
 */

export type ScraperCadence = 'daily' | 'weekly';

export type AdminRunStatus = 'running' | 'ok' | 'error';

/** One `ScraperRun` row as the client receives it. */
export interface AdminScraperRun {
  id: string;
  scraper: string;
  cadence: string;
  status: AdminRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  found: number;
  added: number;
  updated: number;
  error: string | null;
}

/**
 * `healthy`: the last run produced rows. `warning`: one or two zero-row or
 * error runs in a row. `failing`: three or more. `never-run`: registered but
 * no run recorded. `retired`: rows exist for a source that is no longer in
 * the scraper registry. `manual`: rows come from user live searches, not a
 * scheduled scraper.
 */
export type AdminSourceStatus = 'healthy' | 'warning' | 'failing' | 'never-run' | 'retired' | 'manual';

export interface AdminSourceRowCounts {
  total: number;
  /** Open, relevant, deadline in the future or unknown. */
  active: number;
  enriched: number;
  verified: number;
  closed: number;
}

export interface AdminSparklinePoint {
  startedAt: string;
  found: number;
  status: AdminRunStatus;
}

export interface AdminSourceHealth {
  name: string;
  /** Null for a retired source. */
  cadence: ScraperCadence | null;
  registered: boolean;
  status: AdminSourceStatus;
  lastRun: AdminScraperRun | null;
  /** Finished runs, newest first, that found nothing or errored, up to the last good run. */
  consecutiveEmptyRuns: number;
  /** Runs started in the last 14 days, oldest first. */
  sparkline: AdminSparklinePoint[];
  rows: AdminSourceRowCounts;
}

export interface AdminSourcesResponse {
  sources: AdminSourceHealth[];
  generatedAt: string;
}

export interface AdminEnrichmentQueue {
  /** Rows never enriched that still have attempts left. */
  backlog: number;
  /** Rows a worker currently holds. */
  claimed: number;
  /** Claims older than the stale window: a worker crashed or timed out mid-row. */
  staleClaims: number;
  /** Rows that used all their attempts. */
  failed: number;
  enrichedLast24h: number;
  lastEnrichedAt: string | null;
}

export interface AdminEnrichmentBudget {
  /** UTC day the budget is keyed on, YYYY-MM-DD. */
  date: string;
  used: number;
  limit: number;
}

export interface AdminVerificationQueue {
  /** Rows due now, per the windows in `services/verification.ts`. */
  due: number;
  dueDeadlineSoon: number;
  dueStale: number;
  withError: number;
  /** Visible rows whose deadline or event date was extracted with low confidence. */
  lowConfidenceDates: number;
  verifiedLast24h: number;
  lastVerifiedAt: string | null;
}

/** When each scheduled job last showed signs of life. */
export interface AdminCronActivity {
  /** Latest daily-cadence scraper run. */
  dailySyncAt: string | null;
  /** Latest weekly-cadence scraper run. */
  weeklySyncAt: string | null;
  /** Latest `enrichedAt` or `verifiedAt` stamp; the 5-minute cron leaves no other trace. */
  enrichmentAt: string | null;
  /** False when the enrichment cron has nothing to do, so silence is expected. */
  enrichmentHasWork: boolean;
}

export type AdminPipelineEventKind = 'scraper-run' | 'enrichment' | 'verification';

export interface AdminPipelineEvent {
  at: string;
  kind: AdminPipelineEventKind;
  status: 'ok' | 'error';
  /** Short and human-readable, e.g. "confs.tech: 19 found, 2 added". */
  summary: string;
  detail: string | null;
}

export interface AdminPipelineResponse {
  enrichment: AdminEnrichmentQueue;
  budget: AdminEnrichmentBudget;
  verification: AdminVerificationQueue;
  crons: AdminCronActivity;
  /** Newest first, at most 10. */
  events: AdminPipelineEvent[];
  generatedAt: string;
}

export interface AdminCount {
  label: string;
  count: number;
}

/** A row whose closest event scored in the review band: not linked, listed for threshold tuning. */
export interface AdminPossibleDuplicate {
  opportunityId: string;
  title: string;
  source: string;
  eventDate: string | null;
  /** The event the row was given instead. */
  ownEvent: string | null;
  possibleEventId: string;
  possibleEvent: string | null;
  /** 0..1, between the review and auto-link thresholds. */
  score: number;
}

/** Canonical events across the whole catalogue (services/eventMatching.ts). */
export interface AdminEventStats {
  events: number;
  linkedRows: number;
  /** Rows no event could be named for (title is nothing but filler). */
  unlinkedRows: number;
  /** Linked rows per event, one decimal. */
  rowsPerEvent: number;
  /** Events listed by more than one source. */
  multiSourceEvents: number;
  /** Events with rows in more than one year. */
  multiYearEvents: number;
  thresholds: { autoLink: number; review: number };
  /** Highest score first, at most 25. */
  possibleDuplicates: AdminPossibleDuplicate[];
}

export interface AdminCatalogueResponse {
  totals: {
    all: number;
    /** Open, relevant, deadline in the future or unknown. */
    active: number;
    closed: number;
    irrelevant: number;
    /** Deadline passed but the row is still stored. */
    expired: number;
  };
  byFormat: AdminCount[];
  /** Top 15 industries across active rows. */
  byIndustry: AdminCount[];
  /** Active rows by days until the deadline. */
  byDeadline: {
    within7Days: number;
    within30Days: number;
    within90Days: number;
    later: number;
    noDeadline: number;
  };
  closedThisWeek: number;
  remote: number;
  inPerson: number;
  events: AdminEventStats;
  generatedAt: string;
}

export interface AdminSavedSearchDemand {
  total: number;
  users: number;
  createdLast7d: number;
  withQuery: number;
  remoteOnly: number;
  topQueries: AdminCount[];
  topIndustries: AdminCount[];
  topLocations: AdminCount[];
  topFormats: AdminCount[];
}

export interface AdminSearchLogQuery {
  query: string;
  count: number;
  averageResults: number;
  lastSearchedAt: string | null;
}

/** `GET /api/admin/analytics/search-log`: what people search for live, last 30 days. */
export interface AdminSearchLogResponse {
  total7d: number;
  total30d: number;
  distinctQueries30d: number;
  /** Most frequent first. */
  topQueries: AdminSearchLogQuery[];
}

export interface AdminDemandResponse {
  savedSearches: AdminSavedSearchDemand;
  searchLog: AdminSearchLogResponse;
  generatedAt: string;
}

/** `POST /api/admin/enrichment/run` */
export interface AdminEnrichmentBatchResult {
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
  retried: number;
  verified: number;
  verifyFailed: number;
  durationMs: number;
}

/** `POST /api/sync?mode=<cadence>&scraper=<name>` */
export interface AdminScraperRunResult {
  runs: Array<{
    scraper: string;
    status: 'ok' | 'error';
    found: number;
    added: number;
    updated: number;
    durationMs: number;
    error?: string;
  }>;
  skipped: string[];
  durationMs: number;
}
