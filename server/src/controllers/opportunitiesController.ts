import { type Request, type Response, type NextFunction } from 'express';
import * as opportunityService from '../services/opportunityService.js';
import * as liveSearchService from '../services/liveSearchService.js';
import { recordSearch } from '../services/searchLog.js';
import * as profileService from '../services/profileService.js';
import { scoreOpportunities } from '../services/matchScore.js';
import { buildFilters } from './opportunityFilters.js';
import { AppError } from '../middleware/errorHandler.js';
import { isValidTimezone } from '../lib/deadlines.js';
import type {
  ApiResponse,
  CompensationType,
  FilterOptions,
  Opportunity,
  OpportunityFormat,
  OpportunityWithDates,
  OpportunitiesResponse,
  SaveLiveOpportunityInput,
  SerializableOpportunity,
} from 'shared';

export async function getOpportunities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { liveSearch: doLiveSearch, page, pageSize, ...queryParams } = req.query;

    const filters = buildFilters(queryParams);
    const pagination = {
      page: page ? parseInt(String(page), 10) : undefined,
      pageSize: pageSize ? parseInt(String(pageSize), 10) : undefined,
    };

    // A signed-in user with a speaker profile gets a match score on every row.
    const profile = req.user ? await profileService.getMatchProfile(req.user.userId) : null;
    const listOptions: opportunityService.ListOptions = { profile };

    // Always fetch DB results
    const dbResults = await opportunityService.getOpportunities(filters, pagination, listOptions);

    // If liveSearch requested, also run live search
    let liveResults: liveSearchService.EnrichedLiveResult[] = [];
    if (doLiveSearch === 'true' && (queryParams.search || queryParams.industries)) {
      const searchQuery = queryParams.search ? String(queryParams.search) : '';
      const industryList = queryParams.industries
        ? Array.isArray(queryParams.industries)
          ? (queryParams.industries as string[]).map(String)
          : [String(queryParams.industries)]
        : [];
      const locationList = queryParams.locations
        ? Array.isArray(queryParams.locations)
          ? (queryParams.locations as string[]).map(String)
          : [String(queryParams.locations)]
        : [];

      // Pass through all relevant filters for post-fetch filtering
      const liveFilters: liveSearchService.LiveSearchFilters = {
        locations: locationList.length > 0 ? locationList : undefined,
        isRemote: filters.isRemote,
        format: filters.format,
        compensationType: filters.compensationType,
      };

      // performLiveSearch persists every hit before returning; the enrichment
      // cron finishes the ones it did not enrich in the request.
      liveResults = await liveSearchService.performLiveSearch(searchQuery, industryList, locationList, liveFilters);
      // Awaited on purpose: a fire-and-forget insert is lost when the function freezes.
      await recordSearch({
        query: searchQuery,
        industries: industryList,
        locations: locationList,
        resultCount: liveResults.length,
        userId: req.user?.userId,
      });
    }

    // Deduplicate: exclude DB results that match live result URLs
    const liveUrls = new Set(liveResults.map((r) => r.applyUrl));
    const dedupedDbItems: OpportunityWithDates[] = liveResults.length > 0
      ? dbResults.items.filter((item) => !liveUrls.has(item.applyUrl))
      : dbResults.items;

    // Convert live results to match the Opportunity response shape
    const liveItems: Opportunity[] = liveResults.map((r) => ({
      id: r.id,
      title: r.title,
      organization: r.organization,
      description: r.description,
      location: r.location,
      isRemote: r.isRemote,
      eventDate: r.eventDate,
      cfpDeadline: r.cfpDeadline,
      deadlineTimezone: r.deadlineTimezone ?? null,
      format: r.format as OpportunityFormat,
      industries: r.industries,
      compensationType: r.compensationType as CompensationType | null,
      compensationAmount: r.compensationAmount,
      compensationDetails: r.compensationDetails,
      applyUrl: r.applyUrl,
      qualityScore: r.qualityScore,
      source: r.source,
      sourceUrl: r.sourceUrl,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isLiveResult: true,
      liveSearchUrl: r.liveSearchUrl,
      matchesLocationFilter: r.matchesLocationFilter,
    }));
    const liveOpportunities: Opportunity[] = profile ? scoreOpportunities(profile, liveItems) : liveItems;

    // Combine and sort
    const combined: SerializableOpportunity[] = [...liveOpportunities, ...dedupedDbItems];
    const sortBy = filters.sortBy === 'match' && !profile ? 'quality' : filters.sortBy || 'deadline';

    combined.sort((a, b) => {
      const dateVal = (v: string | Date | null) => {
        if (!v) return Number.MAX_SAFE_INTEGER;
        const d = new Date(v).getTime();
        return isNaN(d) ? Number.MAX_SAFE_INTEGER : d;
      };

      if (sortBy === 'match') {
        return (b.matchScore ?? -1) - (a.matchScore ?? -1) || dateVal(a.cfpDeadline) - dateVal(b.cfpDeadline);
      }
      if (sortBy === 'quality') return (b.qualityScore || 0) - (a.qualityScore || 0);
      if (sortBy === 'eventDate') return dateVal(a.eventDate) - dateVal(b.eventDate);
      return dateVal(a.cfpDeadline) - dateVal(b.cfpDeadline);
    });

    const payload: OpportunitiesResponse<SerializableOpportunity> = {
      success: true,
      data: {
        ...dbResults,
        items: combined,
        liveResultCount: liveResults.length,
      },
    };
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function getOpportunityById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const profile = req.user ? await profileService.getMatchProfile(req.user.userId) : null;
    const opportunity = await opportunityService.getOpportunityById(id, { profile });

    const payload: ApiResponse<OpportunityWithDates> = { success: true, data: opportunity };
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function getFilterOptions(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [locations, industries, compensationRange, compensationStats] = await Promise.all([
      opportunityService.getUniqueLocations(),
      opportunityService.getUniqueIndustries(),
      opportunityService.getCompensationRange(),
      opportunityService.getCompensationStats(),
    ]);

    const payload: ApiResponse<FilterOptions> = {
      success: true,
      data: {
        locations,
        industries,
        compensationRange,
        compensationStats,
        formats: ['conference', 'meetup', 'podcast', 'webinar', 'workshop', 'panel', 'other'],
        compensationTypes: ['paid', 'travel', 'exposure', 'honorarium'],
      },
    };
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function liveSearch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { query, industries, locations, isRemote, format, compensationType } = req.query;

    const searchQuery = query ? String(query) : '';
    const industryList = industries
      ? Array.isArray(industries)
        ? industries.map(String)
        : [String(industries)]
      : [];
    const locationList = locations
      ? Array.isArray(locations)
        ? locations.map(String)
        : [String(locations)]
      : [];

    const liveFilters: liveSearchService.LiveSearchFilters = {
      locations: locationList.length > 0 ? locationList : undefined,
      isRemote: isRemote === 'true' ? true : undefined,
      format: format
        ? Array.isArray(format) ? format.map(String) : [String(format)]
        : undefined,
      compensationType: compensationType
        ? Array.isArray(compensationType) ? compensationType.map(String) : [String(compensationType)]
        : undefined,
    };

    // Hits are persisted inside performLiveSearch; nothing runs after the response.
    const results = await liveSearchService.performLiveSearch(
      searchQuery,
      industryList,
      locationList,
      liveFilters
    );
    await recordSearch({
      query: searchQuery,
      industries: industryList,
      locations: locationList,
      resultCount: results.length,
      userId: req.user?.userId,
    });

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
}

export async function saveLiveResult(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      title,
      organization,
      description,
      location,
      isRemote,
      eventDate,
      cfpDeadline,
      deadlineTimezone,
      format,
      industries,
      compensationType,
      compensationAmount,
      compensationDetails,
      qualityScore,
      applyUrl,
      liveSearchUrl,
    } = req.body as SaveLiveOpportunityInput;

    if (!title || !applyUrl) {
      throw new AppError(400, 'Title and applyUrl are required');
    }

    // Check if this URL already exists in the database
    const existing = await opportunityService.findByApplyUrl(applyUrl);
    if (existing) {
      const payload: ApiResponse<OpportunityWithDates> = { success: true, data: existing };
      res.json(payload);
      return;
    }

    const opportunity = await opportunityService.createOpportunity({
      title,
      organization: organization || 'Unknown Organization',
      description: description || undefined,
      location: location || undefined,
      isRemote: isRemote || false,
      eventDate: eventDate ? new Date(eventDate) : undefined,
      cfpDeadline: cfpDeadline ? new Date(cfpDeadline) : undefined,
      deadlineTimezone: cfpDeadline && isValidTimezone(deadlineTimezone) ? deadlineTimezone : undefined,
      format: format || 'conference',
      industries: industries || [],
      compensationType: compensationType || undefined,
      compensationAmount: compensationAmount || undefined,
      compensationDetails: compensationDetails || undefined,
      qualityScore: qualityScore || undefined,
      applyUrl,
      source: 'Live Search',
      sourceUrl: liveSearchUrl || applyUrl,
    });

    const payload: ApiResponse<OpportunityWithDates> = { success: true, data: opportunity };
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}
