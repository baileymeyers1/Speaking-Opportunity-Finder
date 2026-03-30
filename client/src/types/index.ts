// User types
export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
  preferredIndustries: string[];
  createdAt: string;
}

// Opportunity types
export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: string | null;
  cfpDeadline: string | null;
  format: OpportunityFormat;
  industries: string[];
  compensationType: CompensationType | null;
  compensationAmount: number | null;
  compensationDetails: string | null;
  applyUrl: string;
  qualityScore?: number | null;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  isLiveResult?: boolean;
  liveSearchUrl?: string;
}

export type OpportunityFormat =
  | 'conference'
  | 'meetup'
  | 'podcast'
  | 'webinar'
  | 'workshop'
  | 'panel'
  | 'other';

export type CompensationType = 'paid' | 'travel' | 'exposure' | 'honorarium';

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
  sortBy?: 'quality' | 'deadline' | 'eventDate';
  qualityMin?: number;
}

// Filter options returned from API
export interface FilterOptions {
  locations: string[];
  industries: string[];
  compensationRange: { min: number; max: number };
  compensationStats?: { hasCompensation: boolean };
  formats: OpportunityFormat[];
  compensationTypes: CompensationType[];
}

// Saved opportunity types
export interface SavedOpportunity {
  id: string;
  userId: string;
  opportunityId: string;
  category: SavedCategory;
  createdAt: string;
  opportunity?: Opportunity;
}

export type SavedCategory = 'interested' | 'applied' | 'accepted' | 'rejected';

// Saved search types
export interface SavedSearch {
  id: string;
  name: string;
  query: string | null;
  filters: string; // JSON string
  createdAt: string;
  updatedAt: string;
}

// Auth types
export interface AuthResponse {
  user: User;
}

// API response types
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
