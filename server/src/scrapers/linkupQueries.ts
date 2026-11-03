import type { OpportunityFormat } from '../services/extraction.js';

/**
 * The Linkup query set. Each entry carries the industries to tag hits with and
 * the format the hit is labelled as, so a podcast guest call is stored as a
 * podcast rather than defaulting to "conference".
 */
export interface LinkupQuery {
  query: string;
  industries: string[];
  format: OpportunityFormat;
}

function currentYear(): number {
  return new Date().getFullYear();
}

const US_FOCUS_SUFFIX = `USA United States ${currentYear()} ${(currentYear() + 1)}`;

function withUsFocus(query: string) {
  return `${query} ${US_FOCUS_SUFFIX}`;
}

/** Industry-specific conference CFP queries; one slice of these runs per day. */
export const INDUSTRY_CFP_QUERIES: LinkupQuery[] = [
  // --- Technology (normalized, not over-represented) ---
  { query: withUsFocus('AI artificial intelligence machine learning conference call for speakers CFP'), industries: ['ai', 'machine learning'], format: 'conference' },
  { query: withUsFocus('data science analytics conference call for speakers CFP'), industries: ['data science'], format: 'conference' },
  { query: withUsFocus('cloud computing devops conference call for speakers CFP'), industries: ['cloud', 'devops'], format: 'conference' },
  { query: withUsFocus('cybersecurity infosec conference call for papers CFP'), industries: ['cybersecurity'], format: 'conference' },
  { query: withUsFocus('software engineering developer conference call for speakers CFP'), industries: ['software development'], format: 'conference' },
  { query: withUsFocus('blockchain web3 conference call for speakers CFP'), industries: ['blockchain'], format: 'conference' },
  { query: withUsFocus('IoT internet of things conference call for speakers CFP'), industries: ['iot'], format: 'conference' },

  // --- Business & Professional ---
  { query: withUsFocus('sales conference call for speakers CFP'), industries: ['sales'], format: 'conference' },
  { query: withUsFocus('marketing digital marketing conference call for speakers CFP'), industries: ['marketing'], format: 'conference' },
  { query: withUsFocus('advertising conference call for speakers CFP'), industries: ['advertising'], format: 'conference' },
  { query: withUsFocus('public relations PR conference call for speakers CFP'), industries: ['public relations'], format: 'conference' },
  { query: withUsFocus('HR human resources recruiting conference call for speakers CFP'), industries: ['hr', 'recruiting'], format: 'conference' },
  { query: withUsFocus('management leadership conference call for speakers CFP'), industries: ['management', 'leadership'], format: 'conference' },
  { query: withUsFocus('entrepreneurship startup conference call for speakers CFP'), industries: ['entrepreneurship', 'startups'], format: 'conference' },
  { query: withUsFocus('venture capital conference call for speakers CFP'), industries: ['venture capital'], format: 'conference' },
  { query: withUsFocus('business strategy operations conference call for speakers CFP'), industries: ['business strategy', 'operations'], format: 'conference' },
  { query: withUsFocus('supply chain logistics conference call for speakers CFP'), industries: ['supply chain', 'logistics'], format: 'conference' },
  { query: withUsFocus('consulting professional services conference call for speakers CFP'), industries: ['consulting'], format: 'conference' },

  // --- Creative & Media ---
  { query: withUsFocus('entertainment film television conference call for speakers CFP'), industries: ['entertainment', 'film'], format: 'conference' },
  { query: withUsFocus('music industry conference call for speakers CFP'), industries: ['music'], format: 'conference' },
  { query: withUsFocus('gaming esports conference call for speakers CFP'), industries: ['gaming', 'esports'], format: 'conference' },
  { query: withUsFocus('media journalism conference call for speakers CFP'), industries: ['media', 'journalism'], format: 'conference' },
  { query: withUsFocus('publishing content creation conference call for speakers CFP'), industries: ['publishing', 'content creation'], format: 'conference' },
  { query: withUsFocus('photography animation conference call for speakers CFP'), industries: ['photography', 'animation'], format: 'conference' },
  { query: withUsFocus('podcasting conference call for speakers CFP'), industries: ['podcasting'], format: 'conference' },

  // --- Design & Arts ---
  { query: withUsFocus('graphic design conference call for speakers CFP'), industries: ['graphic design'], format: 'conference' },
  { query: withUsFocus('UX UI design conference call for speakers CFP'), industries: ['ux', 'design'], format: 'conference' },
  { query: withUsFocus('industrial design conference call for speakers CFP'), industries: ['industrial design'], format: 'conference' },
  { query: withUsFocus('architecture conference call for speakers CFP'), industries: ['architecture'], format: 'conference' },
  { query: withUsFocus('interior design conference call for speakers CFP'), industries: ['interior design'], format: 'conference' },
  { query: withUsFocus('fashion industry conference call for speakers CFP'), industries: ['fashion'], format: 'conference' },
  { query: withUsFocus('fine arts conference call for speakers CFP'), industries: ['fine arts'], format: 'conference' },

  // --- Science & Research ---
  { query: withUsFocus('biology life sciences conference call for speakers CFP'), industries: ['biology'], format: 'conference' },
  { query: withUsFocus('chemistry conference call for speakers CFP'), industries: ['chemistry'], format: 'conference' },
  { query: withUsFocus('physics conference call for speakers CFP'), industries: ['physics'], format: 'conference' },
  { query: withUsFocus('space astronomy conference call for speakers CFP'), industries: ['space', 'astronomy'], format: 'conference' },
  { query: withUsFocus('environmental science climate conference call for speakers CFP'), industries: ['environmental science', 'climate'], format: 'conference' },
  { query: withUsFocus('geology earth science conference call for speakers CFP'), industries: ['geology'], format: 'conference' },
  { query: withUsFocus('marine science oceanography conference call for speakers CFP'), industries: ['marine science'], format: 'conference' },

  // --- Healthcare & Wellness ---
  { query: withUsFocus('healthcare medical conference call for speakers CFP'), industries: ['healthcare'], format: 'conference' },
  { query: withUsFocus('nursing conference call for speakers CFP'), industries: ['nursing'], format: 'conference' },
  { query: withUsFocus('public health conference call for speakers CFP'), industries: ['public health'], format: 'conference' },
  { query: withUsFocus('mental health psychology conference call for speakers CFP'), industries: ['mental health'], format: 'conference' },
  { query: withUsFocus('pharmacy pharmaceutical conference call for speakers CFP'), industries: ['pharmacy', 'pharmaceutical'], format: 'conference' },
  { query: withUsFocus('dentistry dental conference call for speakers CFP'), industries: ['dentistry'], format: 'conference' },
  { query: withUsFocus('wellness fitness nutrition conference call for speakers CFP'), industries: ['wellness', 'fitness', 'nutrition'], format: 'conference' },

  // --- Finance & Economics ---
  { query: withUsFocus('fintech finance banking conference call for speakers CFP'), industries: ['finance', 'fintech'], format: 'conference' },
  { query: withUsFocus('insurance insurtech conference call for speakers CFP'), industries: ['insurance'], format: 'conference' },
  { query: withUsFocus('accounting conference call for speakers CFP'), industries: ['accounting'], format: 'conference' },
  { query: withUsFocus('investment wealth management conference call for speakers CFP'), industries: ['investment'], format: 'conference' },
  { query: withUsFocus('real estate proptech conference call for speakers CFP'), industries: ['real estate'], format: 'conference' },
  { query: withUsFocus('economics conference call for speakers CFP'), industries: ['economics'], format: 'conference' },

  // --- Education ---
  { query: withUsFocus('K-12 education conference call for speakers CFP'), industries: ['k-12 education'], format: 'conference' },
  { query: withUsFocus('higher education university conference call for speakers CFP'), industries: ['higher education'], format: 'conference' },
  { query: withUsFocus('edtech online learning conference call for speakers CFP'), industries: ['edtech'], format: 'conference' },
  { query: withUsFocus('special education conference call for speakers CFP'), industries: ['special education'], format: 'conference' },
  { query: withUsFocus('STEM education conference call for speakers CFP'), industries: ['stem education'], format: 'conference' },

  // --- Government & Policy ---
  { query: withUsFocus('public policy government conference call for speakers CFP'), industries: ['public policy', 'government'], format: 'conference' },
  { query: withUsFocus('nonprofit social impact conference call for speakers CFP'), industries: ['nonprofit', 'social impact'], format: 'conference' },
  { query: withUsFocus('international relations conference call for speakers CFP'), industries: ['international relations'], format: 'conference' },
  { query: withUsFocus('defense military conference call for speakers CFP'), industries: ['defense'], format: 'conference' },

  // --- Engineering ---
  { query: withUsFocus('civil engineering conference call for speakers CFP'), industries: ['civil engineering'], format: 'conference' },
  { query: withUsFocus('mechanical engineering conference call for speakers CFP'), industries: ['mechanical engineering'], format: 'conference' },
  { query: withUsFocus('electrical engineering conference call for speakers CFP'), industries: ['electrical engineering'], format: 'conference' },
  { query: withUsFocus('aerospace engineering conference call for speakers CFP'), industries: ['aerospace'], format: 'conference' },
  { query: withUsFocus('automotive engineering conference call for speakers CFP'), industries: ['automotive'], format: 'conference' },

  // --- Legal ---
  { query: withUsFocus('legal law conference call for speakers CFP'), industries: ['legal'], format: 'conference' },
  { query: withUsFocus('compliance regulation conference call for speakers CFP'), industries: ['compliance', 'regulation'], format: 'conference' },
  { query: withUsFocus('intellectual property privacy conference call for speakers CFP'), industries: ['intellectual property', 'privacy'], format: 'conference' },

  // --- Agriculture & Food ---
  { query: withUsFocus('agriculture farming conference call for speakers CFP'), industries: ['agriculture'], format: 'conference' },
  { query: withUsFocus('food science conference call for speakers CFP'), industries: ['food science'], format: 'conference' },
  { query: withUsFocus('sustainability agtech conference call for speakers CFP'), industries: ['sustainability', 'agtech'], format: 'conference' },

  // --- Transportation & Logistics ---
  { query: withUsFocus('aviation conference call for speakers CFP'), industries: ['aviation'], format: 'conference' },
  { query: withUsFocus('shipping logistics conference call for speakers CFP'), industries: ['shipping', 'logistics'], format: 'conference' },
  { query: withUsFocus('urban planning smart cities conference call for speakers CFP'), industries: ['urban planning', 'smart cities'], format: 'conference' },

  // --- Energy ---
  { query: withUsFocus('renewable energy clean tech conference call for speakers CFP'), industries: ['renewable energy', 'clean tech'], format: 'conference' },
  { query: withUsFocus('oil gas energy conference call for speakers CFP'), industries: ['oil and gas', 'energy'], format: 'conference' },
  { query: withUsFocus('nuclear energy utilities conference call for speakers CFP'), industries: ['nuclear energy'], format: 'conference' },

  // --- Sports & Recreation ---
  { query: withUsFocus('sports management conference call for speakers CFP'), industries: ['sports management'], format: 'conference' },
  { query: withUsFocus('esports gaming industry conference call for speakers CFP'), industries: ['esports'], format: 'conference' },
  { query: withUsFocus('fitness industry event management conference call for speakers CFP'), industries: ['fitness', 'event management'], format: 'conference' },

  // --- Hospitality & Tourism ---
  { query: withUsFocus('hospitality hotel conference call for speakers CFP'), industries: ['hospitality'], format: 'conference' },
  { query: withUsFocus('travel tourism conference call for speakers CFP'), industries: ['travel', 'tourism'], format: 'conference' },
  { query: withUsFocus('restaurant food service conference call for speakers CFP'), industries: ['restaurants'], format: 'conference' },
  { query: withUsFocus('event planning conference call for speakers CFP'), industries: ['event planning'], format: 'conference' },

  // --- Manufacturing ---
  { query: withUsFocus('manufacturing industry 4.0 conference call for speakers CFP'), industries: ['manufacturing'], format: 'conference' },
  { query: withUsFocus('telecom 5G conference call for speakers CFP'), industries: ['telecom'], format: 'conference' },

  // --- Catch-all ---
  { query: withUsFocus('professional conference call for speakers open submissions'), industries: [], format: 'conference' },
];

function withYears(query: string) {
  return `${query} ${currentYear()} ${currentYear() + 1}`;
}

/**
 * Non-conference speaking formats. Podcasts and webinars are remote by nature,
 * so these carry no US focus; meetup and panel queries keep it.
 */
export const FORMAT_CFP_QUERIES: LinkupQuery[] = [
  // --- Podcasts: guest calls ---
  { query: withYears('"looking for podcast guests" apply technology software'), industries: ['technology'], format: 'podcast' },
  { query: withYears('"be a guest on our podcast" apply business entrepreneurship'), industries: ['business', 'entrepreneurship'], format: 'podcast' },
  { query: withYears('podcast guest application form marketing sales'), industries: ['marketing', 'sales'], format: 'podcast' },
  { query: withYears('"podcast guest" apply health wellness experts wanted'), industries: ['healthcare', 'wellness'], format: 'podcast' },
  { query: withYears('"podcast guest" application leadership management experts'), industries: ['leadership', 'management'], format: 'podcast' },
  { query: withYears('"seeking podcast guests" finance fintech investing'), industries: ['finance', 'fintech'], format: 'podcast' },
  { query: withYears('"podcast guest" apply AI machine learning data'), industries: ['ai', 'data science'], format: 'podcast' },
  { query: withYears('"looking for guests" podcast education teachers edtech'), industries: ['education', 'edtech'], format: 'podcast' },

  // --- Meetups and user groups ---
  { query: withUsFocus('"call for speakers" meetup tech user group'), industries: ['technology'], format: 'meetup' },
  { query: withUsFocus('"lightning talks" wanted speakers meetup'), industries: ['technology'], format: 'meetup' },
  { query: withUsFocus('"speakers wanted" user group monthly meeting developers'), industries: ['software development'], format: 'meetup' },
  { query: withUsFocus('"looking for speakers" meetup data engineering analytics'), industries: ['data science'], format: 'meetup' },
  { query: withUsFocus('"call for speakers" meetup product management design'), industries: ['product management', 'design'], format: 'meetup' },
  { query: withUsFocus('"speakers wanted" meetup startup founders entrepreneurs'), industries: ['startups', 'entrepreneurship'], format: 'meetup' },

  // --- Webinars ---
  { query: withYears('"call for speakers" webinar series technology'), industries: ['technology'], format: 'webinar' },
  { query: withYears('"webinar speakers wanted" apply business professional'), industries: ['business'], format: 'webinar' },
  { query: withYears('"call for presenters" webinar healthcare education'), industries: ['healthcare', 'education'], format: 'webinar' },
  { query: withYears('"present a webinar" call for proposals association members'), industries: [], format: 'webinar' },

  // --- Panels ---
  { query: withUsFocus('"call for panelists" conference panel discussion'), industries: [], format: 'panel' },
  { query: withUsFocus('"panelists wanted" summit apply speak'), industries: ['business'], format: 'panel' },
  { query: withUsFocus('"call for panel proposals" conference'), industries: [], format: 'panel' },
];

/** Every scheduled Linkup query; the daily slice rotates through this list. */
export const LINKUP_QUERIES: LinkupQuery[] = [...INDUSTRY_CFP_QUERIES, ...FORMAT_CFP_QUERIES];

export const LINKUP_QUERY_COUNT = LINKUP_QUERIES.length;

const CFP_WORDS = /\b(call for|speakers?|cfp|podcast|guests?|panel|webinar|talks?|proposals?|papers)\b/i;

/**
 * Turn a normalized user search ("healthcare denver") into a Linkup query for
 * speaking opportunities. Queries that already name a speaking format are kept
 * as they are.
 */
export function promotedQueryFromSearch(normalizedQuery: string): LinkupQuery {
  const query = CFP_WORDS.test(normalizedQuery)
    ? normalizedQuery
    : `${normalizedQuery} call for speakers CFP`;
  return { query: withYears(query), industries: [], format: 'conference' };
}
