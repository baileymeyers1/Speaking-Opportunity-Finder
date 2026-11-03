/**
 * Wire types shared by the client and the server.
 *
 * Dates travel as ISO strings. The server builds its responses from Prisma rows
 * that still hold `Date` objects, so the record types take a date parameter:
 * `Opportunity` is what the client receives, `OpportunityWithDates` is what the
 * server holds right before `res.json` serializes it.
 */

export type OpportunityFormat =
  | 'conference'
  | 'meetup'
  | 'podcast'
  | 'webinar'
  | 'workshop'
  | 'panel'
  | 'other';

export type CompensationType = 'paid' | 'travel' | 'exposure' | 'honorarium';

/** How sure the Claude extraction was about one field. */
export type Confidence = 'high' | 'medium' | 'low';

export interface DateConfidence {
  eventDate: Confidence;
  cfpDeadline: Confidence;
  location: Confidence;
}

/** `match` is only meaningful for a signed-in user with a speaker profile. */
export type SortBy = 'quality' | 'deadline' | 'eventDate' | 'match';

export type SavedCategory = 'interested' | 'applied' | 'accepted' | 'rejected';

// ---------------------------------------------------------------------------
// Speaker profile and match score
// ---------------------------------------------------------------------------

export type SpeakerSeniority = 'new' | 'experienced' | 'keynote';
export type TravelRadius = 'local' | 'country' | 'international';
export type RemotePreference = 'remote_only' | 'prefer_remote' | 'either' | 'prefer_in_person';
export type CompensationRequirement = 'any' | 'travel_covered' | 'paid';

/** Body of `PUT /api/profile`: every field is sent, the server stores the whole thing. */
export interface SpeakerProfileInput {
  /** Free-text tags such as "healthcare" or "developer experience". */
  topics: string[];
  bio: string;
  seniority: SpeakerSeniority;
  homeCity: string | null;
  homeCountry: string | null;
  travelRadius: TravelRadius;
  remotePreference: RemotePreference;
  compensationRequirement: CompensationRequirement;
  preferredFormats: OpportunityFormat[];
}

/** `GET /api/profile` returns this, or `null` while the user has not saved one. */
export interface SpeakerProfile extends SpeakerProfileInput {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/** The explainable score attached to an opportunity for one profile. */
export interface MatchExplanation {
  /** 0..100, deterministic for the same profile, row and date. */
  score: number;
  /** Short reasons the row fits, such as "matches: healthcare" or "travel covered". */
  reasons: string[];
  /** Short reasons it does not, such as "in-person in Berlin, you prefer remote". */
  misses: string[];
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
  preferredIndustries: string[];
  createdAt: string;
}

export interface AuthResponse {
  user: User;
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export interface OpportunityBase<DateType> {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: DateType | null;
  cfpDeadline: DateType | null;
  format: OpportunityFormat;
  industries: string[];
  compensationType: CompensationType | null;
  compensationAmount: number | null;
  compensationDetails: string | null;
  applyUrl: string;
  qualityScore?: number | null;
  source: string;
  sourceUrl: string | null;
  createdAt: DateType;
  updatedAt: DateType;
  /** Enrichment flagged the call for papers as closed. Stored rows only. */
  isClosed?: boolean;
  /** Enrichment judged the page to be a real speaking opportunity. Stored rows only. */
  isRelevant?: boolean;
  /** True for a row produced by a live search that has not been stored yet. */
  isLiveResult?: boolean;
  /** The page a live result was found on. */
  liveSearchUrl?: string;
  /** Set when a location filter is active: whether this row matched it. */
  matchesLocationFilter?: boolean;
  /** When the listing was last checked against its own page. */
  verifiedAt?: DateType | null;
  /** Why the last check could not complete, if it could not. */
  verificationError?: string | null;
  /** Confidence per extracted date field; low-confidence dates render as approximate. */
  dateConfidence?: DateConfidence | null;
  /** Match against the signed-in user's speaker profile, 0..100. Absent without a profile. */
  matchScore?: number;
  matchReasons?: string[];
  matchMisses?: string[];
}

/** An opportunity as the client receives it. */
export type Opportunity = OpportunityBase<string>;

/** An opportunity as the server holds it before JSON serialization. */
export type OpportunityWithDates = OpportunityBase<Date>;

/** A response list may mix stored rows (Date) with live results (string). */
export type SerializableOpportunity = OpportunityBase<Date | string>;

/** Query parameters accepted by `GET /api/opportunities`, as the client models them. */
export interface OpportunityFilters {
  search?: string;
  format?: OpportunityFormat[];
  industries?: string[];
  isRemote?: boolean;
  locations?: string[];
  compensationType?: CompensationType[];
  compensationMin?: number;
  compensationMax?: number;
  cfpDeadlineBefore?: string;
  cfpDeadlineAfter?: string;
  sortBy?: SortBy;
  qualityMin?: number;
}

/** `GET /api/opportunities/filters` */
export interface FilterOptions {
  locations: string[];
  industries: string[];
  compensationRange: { min: number; max: number };
  compensationStats?: { hasCompensation: boolean };
  formats: OpportunityFormat[];
  compensationTypes: CompensationType[];
}

/** Body of `POST /api/opportunities/save-live`. */
export interface SaveLiveOpportunityInput {
  title: string;
  organization?: string | null;
  description?: string | null;
  location?: string | null;
  isRemote?: boolean;
  eventDate?: string | null;
  cfpDeadline?: string | null;
  format?: OpportunityFormat;
  industries?: string[];
  compensationType?: CompensationType | null;
  compensationAmount?: number | null;
  compensationDetails?: string | null;
  qualityScore?: number | null;
  applyUrl: string;
  liveSearchUrl?: string;
}

// ---------------------------------------------------------------------------
// Saved opportunities and searches
// ---------------------------------------------------------------------------

export interface SavedOpportunityBase<DateType> {
  id: string;
  userId: string;
  opportunityId: string;
  category: SavedCategory;
  createdAt: DateType;
  opportunity?: OpportunityBase<DateType> | null;
}

export type SavedOpportunity = SavedOpportunityBase<string>;
export type SavedOpportunityWithDates = SavedOpportunityBase<Date>;

export interface SaveOpportunityInput {
  opportunityId: string;
  category?: SavedCategory;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string | null;
  /** JSON-encoded `OpportunityFilters`. */
  filters: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  liveResultCount?: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export type OpportunitiesResponse<T = Opportunity> = ApiResponse<PaginatedResponse<T>>;

// Admin analytics responses live in their own file; they are part of the same wire contract.
export type * from './admin';
