// User types
export interface User {
  id: string;
  email: string;
  preferredIndustries: string[];
  createdAt: Date;
}

export interface UserCreateInput {
  email: string;
  password: string;
  preferredIndustries?: string[];
}

export interface UserLoginInput {
  email: string;
  password: string;
}

// Opportunity types
export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: Date | null;
  cfpDeadline: Date | null;
  format: OpportunityFormat;
  industries: string[];
  compensationType: CompensationType | null;
  compensationDetails: string | null;
  applyUrl: string;
  qualityScore?: number | null;
  source: string;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  location?: string;
  compensationType?: CompensationType[];
  cfpDeadlineBefore?: Date;
  cfpDeadlineAfter?: Date;
}

// Saved opportunity types
export interface SavedOpportunity {
  id: string;
  userId: string;
  opportunityId: string;
  category: SavedCategory;
  createdAt: Date;
  opportunity?: Opportunity;
}

export type SavedCategory = 'interested' | 'applied' | 'accepted' | 'rejected';

export interface SaveOpportunityInput {
  opportunityId: string;
  category?: SavedCategory;
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

// Pagination params
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}
