import { Request, Response, NextFunction } from 'express';
import * as opportunityService from '../services/opportunityService.js';
import * as liveSearchService from '../services/liveSearchService.js';

export async function getOpportunities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
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
      page,
      pageSize,
    } = req.query;

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

    const pagination = {
      page: page ? parseInt(String(page), 10) : undefined,
      pageSize: pageSize ? parseInt(String(pageSize), 10) : undefined,
    };

    const result = await opportunityService.getOpportunities(
      filters,
      pagination
    );

    res.json({
      success: true,
      data: result,
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
    const [locations, industries, compensationRange] = await Promise.all([
      opportunityService.getUniqueLocations(),
      opportunityService.getUniqueIndustries(),
      opportunityService.getCompensationRange(),
    ]);

    res.json({
      success: true,
      data: {
        locations,
        industries,
        compensationRange,
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
    const { query, industries } = req.query;

    const searchQuery = query ? String(query) : '';
    const industryList = industries
      ? Array.isArray(industries)
        ? industries.map(String)
        : [String(industries)]
      : [];

    const results = await liveSearchService.performLiveSearch(
      searchQuery,
      industryList
    );

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
}
