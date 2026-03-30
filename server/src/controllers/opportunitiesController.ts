import { Request, Response, NextFunction } from 'express';
import * as opportunityService from '../services/opportunityService.js';
import * as liveSearchService from '../services/liveSearchService.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Build OpportunityFilters from raw query params.
 * Extracted so both getOpportunities and any future callers can reuse it.
 */
function buildFilters(query: Record<string, any>): opportunityService.OpportunityFilters {
  const {
    search,
    format,
    industries,
    isRemote,
    location,
    compensationType,
    compensationMin,
    compensationMax,
    cfpDeadlineBefore,
    cfpDeadlineAfter,
    sortBy,
    qualityMin,
  } = query;

  const filters: opportunityService.OpportunityFilters = {};

  if (search) {
    filters.search = String(search);
  }

  if (format) {
    filters.format = Array.isArray(format)
      ? format.map(String)
      : [String(format)];
  }

  if (industries) {
    filters.industries = Array.isArray(industries)
      ? industries.map(String)
      : [String(industries)];
  }

  if (isRemote !== undefined) {
    filters.isRemote = isRemote === 'true';
  }

  // Handle multiple locations (use | as delimiter since locations contain commas)
  if (location) {
    const locations = Array.isArray(location)
      ? location.map(String)
      : [String(location)];
    filters.location = locations.join('|');
  }

  if (compensationType) {
    filters.compensationType = Array.isArray(compensationType)
      ? compensationType.map(String)
      : [String(compensationType)];
  }

  if (compensationMin) {
    filters.compensationMin = parseInt(String(compensationMin), 10);
  }

  if (compensationMax) {
    filters.compensationMax = parseInt(String(compensationMax), 10);
  }

  if (cfpDeadlineBefore) {
    filters.cfpDeadlineBefore = new Date(String(cfpDeadlineBefore));
  }

  if (cfpDeadlineAfter) {
    filters.cfpDeadlineAfter = new Date(String(cfpDeadlineAfter));
  }

  if (sortBy && ['quality', 'deadline', 'eventDate'].includes(String(sortBy))) {
    filters.sortBy = String(sortBy) as 'quality' | 'deadline' | 'eventDate';
  }

  if (qualityMin !== undefined) {
    const value = parseInt(String(qualityMin), 10);
    if (!isNaN(value)) {
      filters.qualityMin = value;
    }
  }

  return filters;
}

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

    // Always fetch DB results
    const dbResults = await opportunityService.getOpportunities(filters, pagination);

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

      liveResults = await liveSearchService.performLiveSearch(searchQuery, industryList, locationList);

      // Fire-and-forget auto-save
      if (liveResults.length > 0) {
        liveSearchService.autoSaveLiveResults(liveResults)
          .then(stats => {
            console.log(`Live search auto-save: ${stats.saved} new, ${stats.updated} updated`);
          })
          .catch(err => {
            console.error('Failed to auto-save live results:', err);
          });
      }
    }

    // Deduplicate: exclude DB results that match live result URLs
    const liveUrls = new Set(liveResults.map((r) => r.applyUrl));
    const dedupedDbItems = liveResults.length > 0
      ? dbResults.items.filter((item: any) => !liveUrls.has(item.applyUrl))
      : dbResults.items;

    // Convert live results to match the Opportunity response shape
    const liveOpportunities = liveResults.map((r) => ({
      id: r.id,
      title: r.title,
      organization: r.organization,
      description: r.description,
      location: r.location,
      isRemote: r.isRemote,
      eventDate: r.eventDate,
      cfpDeadline: r.cfpDeadline,
      format: r.format,
      industries: r.industries,
      compensationType: r.compensationType,
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
    }));

    // Combine and sort
    const combined = [...liveOpportunities, ...dedupedDbItems] as any[];
    const sortBy = filters.sortBy || 'deadline';

    combined.sort((a, b) => {
      const dateVal = (v: string | Date | null) => {
        if (!v) return Number.MAX_SAFE_INTEGER;
        const d = new Date(v).getTime();
        return isNaN(d) ? Number.MAX_SAFE_INTEGER : d;
      };

      if (sortBy === 'quality') return (b.qualityScore || 0) - (a.qualityScore || 0);
      if (sortBy === 'eventDate') return dateVal(a.eventDate) - dateVal(b.eventDate);
      return dateVal(a.cfpDeadline) - dateVal(b.cfpDeadline);
    });

    res.json({
      success: true,
      data: {
        ...dbResults,
        items: combined,
        liveResultCount: liveResults.length,
      },
    });
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
    const opportunity = await opportunityService.getOpportunityById(id);

    res.json({
      success: true,
      data: opportunity,
    });
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

    res.json({
      success: true,
      data: {
        locations,
        industries,
        compensationRange,
        compensationStats,
        formats: [
          'conference',
          'meetup',
          'podcast',
          'webinar',
          'workshop',
          'panel',
          'other',
        ],
        compensationTypes: ['paid', 'travel', 'exposure', 'honorarium'],
      },
    });
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
    const { query, industries, locations } = req.query;

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

    const results = await liveSearchService.performLiveSearch(
      searchQuery,
      industryList,
      locationList
    );

    // Auto-save live results to database (async, don't wait for completion)
    if (results.length > 0) {
      liveSearchService.autoSaveLiveResults(results)
        .then(stats => {
          console.log(`Live search auto-save: ${stats.saved} new, ${stats.updated} updated`);
        })
        .catch(err => {
          console.error('Failed to auto-save live results:', err);
        });
    }

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
      format,
      industries,
      compensationType,
      compensationAmount,
      compensationDetails,
      qualityScore,
      applyUrl,
      liveSearchUrl,
    } = req.body;

    if (!title || !applyUrl) {
      throw new AppError(400, 'Title and applyUrl are required');
    }

    // Check if this URL already exists in the database
    const existing = await opportunityService.findByApplyUrl(applyUrl);
    if (existing) {
      res.json({ success: true, data: existing });
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

    res.status(201).json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
}
