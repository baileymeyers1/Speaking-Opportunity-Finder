import { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

export interface OpportunityFilters {
  search?: string;
  format?: string[];
  industries?: string[];
  isRemote?: boolean;
  location?: string;
  compensationType?: string[];
  compensationMin?: number;
  compensationMax?: number;
  cfpDeadlineBefore?: Date;
  cfpDeadlineAfter?: Date;
  sortBy?: 'quality' | 'deadline' | 'eventDate';
  qualityMin?: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

function parseJsonArray(value: string): string[] {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function transformOpportunity(opp: {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  location: string | null;
  isRemote: boolean;
  eventDate: Date | null;
  cfpDeadline: Date | null;
  format: string;
  industries: string;
  compensationType: string | null;
  compensationAmount: number | null;
  compensationDetails: string | null;
  applyUrl: string;
  qualityScore: number | null;
  source: string;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...opp,
    industries: parseJsonArray(opp.industries),
  };
}

export async function getOpportunities(
  filters: OpportunityFilters = {},
  pagination: PaginationParams = {}
) {
  const { page = 1, pageSize = 20 } = pagination;
  const skip = (page - 1) * pageSize;

  const where: Prisma.OpportunityWhereInput = {
    // Default: only show opportunities with future deadlines (or no deadline set)
    OR: [
      { cfpDeadline: { gte: new Date() } },
      { cfpDeadline: null },
    ],
  };
  const andConditions: Prisma.OpportunityWhereInput[] = [];

  // Text search (OR across fields, but AND with other filters)
  if (filters.search) {
    andConditions.push({
      OR: [
        { title: { contains: filters.search } },
        { organization: { contains: filters.search } },
        { description: { contains: filters.search } },
      ],
    });
  }

  // Format filter
  if (filters.format && filters.format.length > 0) {
    where.format = { in: filters.format };
  }

  // Industry filter (OR logic - match ANY selected industry)
  if (filters.industries && filters.industries.length > 0) {
    andConditions.push({
      OR: filters.industries.map((industry) => ({
        industries: { contains: industry },
      })),
    });
  }

  // Apply AND conditions if any exist
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  // Remote filter
  if (filters.isRemote !== undefined) {
    where.isRemote = filters.isRemote;
  }

  // Location filter (supports multiple pipe-separated locations, fuzzy contains)
  if (filters.location) {
    const locations = filters.location.split('|').map((l) => l.trim()).filter(Boolean);
    if (locations.length === 1) {
      andConditions.push({
        location: { contains: locations[0] },
      });
    } else if (locations.length > 1) {
      andConditions.push({
        OR: locations.map((loc) => ({
          location: { contains: loc },
        })),
      });
    }
  }

  // Compensation type filter
  if (filters.compensationType && filters.compensationType.length > 0) {
    where.compensationType = { in: filters.compensationType };
  }

  // Compensation amount range filter
  if (filters.compensationMin !== undefined || filters.compensationMax !== undefined) {
    where.compensationAmount = {};
    if (filters.compensationMin !== undefined) {
      where.compensationAmount.gte = filters.compensationMin;
    }
    if (filters.compensationMax !== undefined) {
      where.compensationAmount.lte = filters.compensationMax;
    }
  }

  if (filters.qualityMin !== undefined) {
    where.qualityScore = { gte: filters.qualityMin };
  }

  // CFP deadline filters
  if (filters.cfpDeadlineBefore || filters.cfpDeadlineAfter) {
    where.cfpDeadline = {};
    if (filters.cfpDeadlineBefore) {
      where.cfpDeadline.lte = filters.cfpDeadlineBefore;
    }
    if (filters.cfpDeadlineAfter) {
      where.cfpDeadline.gte = filters.cfpDeadlineAfter;
    }
  }

  const orderBy: Prisma.OpportunityOrderByWithRelationInput[] =
    filters.sortBy === 'quality'
      ? [
          { qualityScore: Prisma.SortOrder.desc },
          { cfpDeadline: Prisma.SortOrder.asc },
        ]
      : filters.sortBy === 'eventDate'
        ? [
            { eventDate: Prisma.SortOrder.asc },
            { cfpDeadline: Prisma.SortOrder.asc },
          ]
        : [{ cfpDeadline: Prisma.SortOrder.asc }];

  const [items, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
    }),
    prisma.opportunity.count({ where }),
  ]);

  return {
    items: items.map(transformOpportunity),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getOpportunityById(id: string) {
  const opportunity = await prisma.opportunity.findUnique({ where: { id } });

  if (!opportunity) {
    throw new AppError(404, 'Opportunity not found');
  }

  return transformOpportunity(opportunity);
}

export interface OpportunityCreateInput {
  title: string;
  organization: string;
  description?: string;
  location?: string;
  isRemote?: boolean;
  eventDate?: Date;
  cfpDeadline?: Date;
  format: string;
  industries?: string[];
  compensationType?: string;
  compensationAmount?: number;
  compensationDetails?: string;
  applyUrl: string;
  qualityScore?: number;
  source: string;
  sourceUrl?: string;
}

export async function createOpportunity(data: OpportunityCreateInput) {
  const opportunity = await prisma.opportunity.create({
    data: {
      ...data,
      industries: JSON.stringify(data.industries || []),
    },
  });
  return transformOpportunity(opportunity);
}

export async function findByApplyUrl(applyUrl: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { applyUrl },
  });
  if (!opportunity) return null;
  return transformOpportunity(opportunity);
}

// Get unique locations for filter dropdown
export async function getUniqueLocations(): Promise<string[]> {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      location: { not: null },
    },
    select: { location: true },
    distinct: ['location'],
  });

  return opportunities
    .map((o) => o.location)
    .filter((l): l is string => l !== null)
    .sort();
}

// Get unique industries for filter dropdown
export async function getUniqueIndustries(): Promise<string[]> {
  const opportunities = await prisma.opportunity.findMany({
    select: { industries: true },
  });

  const allIndustries = new Set<string>();
  for (const opp of opportunities) {
    const industries = parseJsonArray(opp.industries);
    industries.forEach((i) => allIndustries.add(i));
  }

  return Array.from(allIndustries).sort();
}

// Get compensation range for slider bounds
export async function getCompensationRange(): Promise<{ min: number; max: number }> {
  const result = await prisma.opportunity.aggregate({
    _min: { compensationAmount: true },
    _max: { compensationAmount: true },
  });

  return {
    min: result._min.compensationAmount || 0,
    max: result._max.compensationAmount || 5000,
  };
}

export async function getCompensationStats(): Promise<{ hasCompensation: boolean }> {
  const count = await prisma.opportunity.count({
    where: {
      OR: [
        { compensationType: { not: null } },
        { compensationAmount: { not: null } },
      ],
    },
  });

  return { hasCompensation: count > 0 };
}
