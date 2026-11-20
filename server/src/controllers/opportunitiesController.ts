import { type Request, type Response, type NextFunction } from 'express';
import * as opportunityService from '../services/opportunityService.js';
import * as liveSearchService from '../services/liveSearchService.js';
import { recordSearch } from '../services/searchLog.js';
import * as speakerService from '../services/speakerService.js';
import { scoreForRoster } from '../services/matchScore.js';
import { buildFilters, liveSearchTopics } from './opportunityFilters.js';
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

/** Wire shape of a live hit read in this request. */
function liveResultToOpportunity(r: liveSearchService.EnrichedLiveResult): Opportunity {
  return {
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
    sectors: r.sectors,
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
    hasOpenCall: r.hasOpenCall ?? null,
  };
}

/**
 * What a live search adds to the list: the new hits read in the request, and
 * the stored rows of hits seen before (enriched, verified, event-grouped)
 * rather than a fresh copy built from the search snippet.
 */
async function liveOutcomeToItems(
  outcome: liveSearchService.LiveSearchOutcome,
  filters: opportunityService.OpportunityFilters,
  listOptions: opportunityService.ListOptions
): Promise<{ live: Opportunity[]; stored: OpportunityWithDates[] }> {
  const liveItems = outcome.results.map(liveResultToOpportunity);
  const live = scoreForRoster(listOptions.roster ?? [], liveItems, undefined, { speakerId: listOptions.speakerId });
  const stored = await opportunityService.getListedByApplyUrls(outcome.storedUrls, filters, listOptions);
  return { live, stored };
}

/**
 * Whose fit the rows of this request carry: every speaker on the signed-in
 * account's roster, led by the one asked for (`speaker=<id>`) when they are
 * on it, otherwise by whoever fits each row best. Signed out, or with an
 * empty roster, rows carry no fit.
 */
async function fitOptions(req: Request): Promise<opportunityService.ListOptions> {
  if (!req.user) return {};
  const roster = await speakerService.getRoster(req.user.userId);
  const asked = typeof req.query.speaker === 'string' ? req.query.speaker : null;
  return { roster, speakerId: roster.some((member) => member.id === asked) ? asked : null };
}

export async function getOpportunities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // `speaker` says whose fit to lead with (fitOptions); it is not a filter on the list.
    const { liveSearch: doLiveSearch, page, pageSize, speaker: _speaker, ...queryParams } = req.query;

    const filters = buildFilters(queryParams);
    const pagination = {
      page: page ? parseInt(String(page), 10) : undefined,
      pageSize: pageSize ? parseInt(String(pageSize), 10) : undefined,
    };

    // A signed-in account with speakers on its roster gets a fit score on every row.
    const listOptions = await fitOptions(req);

    // Always fetch DB results
    const dbResults = await opportunityService.getOpportunities(filters, pagination, listOptions);

    // If liveSearch requested, also run live search
    let liveOutcome: liveSearchService.LiveSearchOutcome | null = null;
    // A live search needs something to look for: the query text, or a selected sector.
    const industryList = liveSearchTopics(queryParams);
    if (doLiveSearch === 'true' && (queryParams.search || industryList.length > 0)) {
      const searchQuery = queryParams.search ? String(queryParams.search) : '';
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
      liveOutcome = await liveSearchService.performLiveSearch(searchQuery, industryList, locationList, liveFilters);
      // Awaited on purpose: a fire-and-forget insert is lost when the function freezes.
      await recordSearch({
        query: searchQuery,
        industries: industryList,
        locations: locationList,
        resultCount: liveOutcome.results.length + liveOutcome.storedUrls.length,
        userId: req.user?.userId,
      });
    }

    const { live: liveOpportunities, stored: storedHits } = liveOutcome
      ? await liveOutcomeToItems(liveOutcome, filters, listOptions)
      : { live: [], stored: [] };

    // A row surfaced by the live search is listed once, from the live side.
    const surfacedUrls = new Set([...liveOpportunities, ...storedHits].map((item) => item.applyUrl));
    const dedupedDbItems: OpportunityWithDates[] = dbResults.items.filter((item) => !surfacedUrls.has(item.applyUrl));

    // What the live search surfaced leads the list, in the order asked for. The
    // stored rows follow exactly as the service ordered them: re-sorting the
    // page by the deadline column here used to push every row without a
    // deadline to the foot of its page, and a search's hits out of relevance order.
    const surfaced: SerializableOpportunity[] = [...liveOpportunities, ...storedHits];
    const sortBy = filters.sortBy === 'match' && !listOptions.roster?.length ? 'quality' : filters.sortBy || 'deadline';
    const dateVal = (v: string | Date | null) => {
      if (!v) return Number.MAX_SAFE_INTEGER;
      const d = new Date(v).getTime();
      return isNaN(d) ? Number.MAX_SAFE_INTEGER : d;
    };
    surfaced.sort((a, b) => {
      if (sortBy === 'match') {
        return (b.matchScore ?? -1) - (a.matchScore ?? -1) || dateVal(a.cfpDeadline) - dateVal(b.cfpDeadline);
      }
      if (sortBy === 'quality') return (b.qualityScore || 0) - (a.qualityScore || 0);
      if (sortBy === 'eventDate') return dateVal(a.eventDate) - dateVal(b.eventDate);
      return dateVal(a.cfpDeadline) - dateVal(b.cfpDeadline);
    });
    const combined: SerializableOpportunity[] = [...surfaced, ...dedupedDbItems];

    const payload: OpportunitiesResponse<SerializableOpportunity> = {
      success: true,
      data: {
        ...dbResults,
        items: combined,
        liveResultCount: liveOpportunities.length + storedHits.length,
        ...(liveOutcome && {
          pendingLiveHits: liveOutcome.waiting,
          liveFoundCount: liveOutcome.foundCount,
          liveNotOpenCount: liveOutcome.notOpenCount,
          liveNoCallCount: liveOutcome.noCallCount,
          backgroundChecksResumeAt: liveOutcome.backgroundChecksResumeAt,
        }),
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
    // A call's own page says why each speaker fits, not only how well.
    const opportunity = await opportunityService.getOpportunityById(id, { ...(await fitOptions(req)), explainFits: true });

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
    const [locations, sectors, compensationRange, compensationStats] = await Promise.all([
      opportunityService.getUniqueLocations(),
      opportunityService.getSectorOptions(),
      opportunityService.getCompensationRange(),
      opportunityService.getCompensationStats(),
    ]);

    const payload: ApiResponse<FilterOptions> = {
      success: true,
      data: {
        locations,
        sectors,
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
    const { query, locations, isRemote, format, compensationType } = req.query;

    const searchQuery = query ? String(query) : '';
    const industryList = liveSearchTopics(req.query);
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
    const outcome = await liveSearchService.performLiveSearch(
      searchQuery,
      industryList,
      locationList,
      liveFilters
    );
    await recordSearch({
      query: searchQuery,
      industries: industryList,
      locations: locationList,
      resultCount: outcome.results.length + outcome.storedUrls.length,
      userId: req.user?.userId,
    });

    const { live, stored } = await liveOutcomeToItems(outcome, {}, await fitOptions(req));
    res.json({
      success: true,
      data: [...live, ...stored],
      pendingLiveHits: outcome.waiting,
      liveFoundCount: outcome.foundCount,
      liveNotOpenCount: outcome.notOpenCount,
      liveNoCallCount: outcome.noCallCount,
      backgroundChecksResumeAt: outcome.backgroundChecksResumeAt,
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
      sectors,
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
      sectors: sectors || [],
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
