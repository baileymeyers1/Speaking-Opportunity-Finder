/** Readable names for the sources a call can come from. */
const SOURCE_LABELS: Record<string, string> = {
  'confs.tech': 'confs.tech',
  'javaconferences.org': 'Java Conferences',
  'callingallpapers.com': 'Calling All Papers',
  'developers.events': 'developers.events',
  'pretalx.com': 'Pretalx',
  'sessionize.com': 'Sessionize',
  'ruralhealthinfo.org': 'Rural Health Information Hub',
  'radioguestlist.com': 'RadioGuestList',
  'wikicfp.com': 'WikiCFP',
  'conferencealerts.com': 'Conference Alerts',
  // Industry calendars (server/src/scrapers/calendars): the credit their terms ask for, linked to the listing.
  'thetradeshowcalendar.com': 'The Trade Show Calendar',
  'civictech.guide': 'Civic Tech Field Guide',
  'wdo.org': 'World Design Organization',
  linkup: 'web search',
  'Live Search': 'live search',
};

/** A readable name for a source id; the id itself when it has no label. */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
