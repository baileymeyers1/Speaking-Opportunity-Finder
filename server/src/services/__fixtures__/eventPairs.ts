/**
 * Real rows from the development database (2026-11-03 scrape) that the event
 * matcher must link, must leave apart, or may only flag for review. Each pair
 * names what the two sources called the same (or a different) conference.
 */
import type { MatchCandidate } from '../eventMatching.js';

export const row = (
  title: string,
  applyUrl: string,
  eventDate: string | null,
  extra: Partial<MatchCandidate> = {}
): MatchCandidate => ({
  title,
  organization: extra.organization ?? title,
  applyUrl,
  eventDate: eventDate ? new Date(eventDate) : null,
  location: extra.location ?? null,
});

/** The same conference, from two sources, that must link automatically. */
export const SAME_EVENT_PAIRS: Array<[string, MatchCandidate, MatchCandidate]> = [
  [
    'BSides Rocket City: callingallpapers (own site) vs developers.events (Sessionize)',
    row('BSides Rocket City', 'https://bsidesrocketcity.org', '2027-03-20', { location: 'Huntsville, Alabama, United States' }),
    row('BSides Rocket City 2027', 'https://sessionize.com/bsides-rocket-city2007/', '2027-03-20', { location: 'Huntsville, AL (USA)' }),
  ],
  [
    'BSides Prague: confs.tech vs developers.events, same CFP host',
    row('BSides Prague', 'https://cfp.bsidesprg.cz/2027/cfp', '2027-04-07', { location: 'Prague, Czech Republic' }),
    row('BSides Prague Czechia 2027', 'https://cfp.bsidesprg.cz/2027/submit/', '2027-04-07', { location: 'Prague (Czechia)' }),
  ],
  [
    'JNation: javaconferences (Sessionize) vs callingallpapers (own site), dates a day apart',
    row('JNation', 'https://sessionize.com/jnation-2027/', '2027-05-25', { location: 'Coimbra, Portugal' }),
    row('JNation 2027', 'https://jnation.pt', '2027-05-24', { location: 'Coimbra, Portugal' }),
  ],
  [
    'SecretCon 5 (2027): edition number and year in both titles',
    row('SecretCon 5 (2027)', 'https://secretcon.com', '2027-05-06', { location: 'Saint Paul, Minnesota, United States' }),
    row('SecretCon 5 (2027)', 'https://sessionize.com/secretcon-5-2027/', '2027-05-06', { location: 'Saint Paul, Minnesota, United States' }),
  ],
  [
    'Optimized AI Conference 2027: trailing space in one organization',
    row('Optimized AI Conference 2027', 'https://www.oaiconference.com', '2027-03-31', { organization: 'Optimized AI Conference 2027 ', location: 'Atlanta, Georgia, United States' }),
    row('Optimized AI Conference 2027', 'https://sessionize.com/OAIConference-2027/', '2027-03-31', { location: 'Atlanta, GA (USA)' }),
  ],
  [
    'Colorado Applied Machine Learning Mini Conference: double space in one title',
    row('Colorado Applied Machine Learning  Mini Conference', 'https://amlcoftherockies.org/conferences/mini-conference', '2026-12-05', { location: 'Denver, Colorado, United States' }),
    row('Colorado Applied Machine Learning Mini Conference 2026', 'https://sessionize.com/colorado-applied-machine-learning-mini/', '2026-12-05', { location: 'Denver, CO (USA)' }),
  ],
  [
    'Adaptive Organizations meet Architecture: one source has the date a month off',
    row('Adaptive Organizations meet Architecture', 'https://agile-meets-architecture.com/2026/home', '2027-04-05', { location: 'Berlin, Germany' }),
    row('Adaptive Organizations meet Architecture 2027', 'https://sessionize.com/adaptive-organizations-meet-architecture/', '2027-03-06', { location: 'Berlin (Germany)' }),
  ],
  [
    'Data Point Prague: own site vs Sessionize, dates a day apart',
    row('Data Point Prague 2027', 'https://datapointprague.cz', '2027-05-18', { location: 'Prague, Czechia' }),
    row('Data Point Prague Czechia 2027', 'https://sessionize.com/data-point-prague-2027/', '2027-05-19', { location: 'Prague (Czechia)' }),
  ],
  [
    'DynamicsCon Regional Europe: Sessionize title carries "Call for Sessions @ Sessionize.com"',
    row('DynamicsCon Regional: Europe 2027', 'https://dynamicscon.com/regionals', '2027-02-10', { location: 'Copenhagen, Denmark' }),
    row('DynamicsCon Regional: Europe 2027: Call for Sessions @ Sessionize.com', 'https://sessionize.com/dynamicscon-regional-europe-2027/', '2027-02-11', { location: 'Copenhagen, Denmark' }),
  ],
  [
    'Workplace Ninjas Norway: one title drops the country',
    row('Workplace Ninjas 2027', 'https://sessionize.com/workplace-ninjas-norway-2027/', '2027-05-20', { location: 'Oslo (Norway)' }),
    row('Workplace Ninjas Norway 2027', 'https://wpninjas.no', '2027-05-19', { location: 'Oslo, Norway' }),
  ],
  [
    'FOSDEM: last year and this year, same site (synthetic prior edition)',
    row('FOSDEM 2026', 'https://fosdem.org/2026/news/call-for-main-track/', '2026-01-31', { location: 'Brussels (Belgium)' }),
    row('FOSDEM 2027', 'https://fosdem.org/2027/news/call-for-main-track/', '2027-01-30', { location: 'Brussels (Belgium)' }),
  ],
];

/** Different conferences that share most of a name; must never link automatically. */
export const DIFFERENT_EVENT_PAIRS: Array<[string, MatchCandidate, MatchCandidate]> = [
  [
    'React Summit vs React Summit Asia (same organizer platform, a month apart)',
    row('React Summit', 'https://gitnation.com/events/react-summit-2027/cfp', '2027-05-21', { location: 'Amsterdam, Netherlands' }),
    row('React Summit Asia', 'https://gitnation.com/events/react-summit-asia/cfp', '2027-04-15', { location: 'Singapore, Singapore' }),
  ],
  [
    'DevFest 2026 (Faro) vs DevFest Kigali 2026',
    row('DevFest 2026', 'https://app.advocu.com/events/6ab2aac807b94a03b9fe1db5', '2026-11-27', { location: 'Faro (Portugal)' }),
    row('DevFest Kigali 2026', 'https://sessionize.com/devfest-kgl-26/', '2026-12-19', { location: 'Kigali (Rwanda)' }),
  ],
  [
    'DevFest 2026 (Faro) vs DevFest 2026: Nova Scotia Edition',
    row('DevFest 2026', 'https://app.advocu.com/events/6ab2aac807b94a03b9fe1db5', '2026-11-27', { location: 'Faro (Portugal)' }),
    row('DevFest 2026: Nova Scotia Edition', 'https://app.advocu.com/events/6ac253183b5fb933c2607baf', '2026-12-05', { location: 'Halifax, NS (Canada)' }),
  ],
  [
    '.NET Conf 2026 Amravati vs .NET Conf 2026 Pune',
    row('.NET Conf 2026 Amravati', 'https://sessionize.com/dnc26/', '2026-12-26', { location: 'P. R. Pote Patil College of Engineering & Management, Amravati, India' }),
    row('.NET Conf 2026 Pune (In-Person)', 'https://www.meetup.com/pune-tech-community/events/316775254', '2026-11-27', { location: 'Pune, India' }),
  ],
  [
    'PyCon DE 2027 vs PyCon Austria 2027',
    row('PyCon DE 2027', 'https://pretalx.com/pyconde-2027/cfp', '2027-04-20'),
    row('PyCon Austria 2027', 'https://pycon.at', '2027-04-10', { location: 'Eisenstadt, Austria' }),
  ],
  [
    'KubeCon + CloudNativeCon Europe vs its Maintainer Summit (same Linux Foundation host)',
    row('KubeCon + CloudNativeCon Europe', 'https://events.linuxfoundation.org/kubecon-cloudnativecon-europe/program/cfp', '2026-03-23', { location: 'Amsterdam, Netherlands' }),
    row('Maintainer Summit: KubeCon + CloudNativeCon Europe 2027', 'https://events.linuxfoundation.org/kubecon-cloudnativecon-europe/features-add-ons/maintainer-summit', '2027-03-13', { location: 'Barcelona, Spain' }),
  ],
  [
    'DevOpsDays Atlanta vs DevOpsDays Raleigh (shared devopsdays.org)',
    row('DevOpsDays Atlanta 2027', 'https://talks.devopsdays.org/devopsdays-atlanta-2027/cfp', '2027-04-20', { location: 'Atlanta, GA (USA)' }),
    row('DevOpsDays Raleigh 2027', 'https://devopsdays.org/events/2027-raleigh/propose/', '2027-04-27', { location: 'Raleigh, NC (USA)' }),
  ],
  [
    'University of Riverside: Summer Global Education vs Summer Global Business Research (same organizer, site and city)',
    row('2027 Summer Global Education Conference', 'https://uofriverside.com/2027-summer-global-education-conference/', '2027-08-12', { organization: 'University of Riverside', location: 'Los Angeles, California, United States' }),
    row('2027 Summer Global Business Research Conference', 'https://uofriverside.com/2027-summer-global-business-research-symposium/', '2027-07-15', { organization: 'University of Riverside', location: 'Los Angeles, California, United States' }),
  ],
  [
    'University of Riverside: Spring Global Human Resource vs Spring Global Management',
    row('2027 Spring Global Human Resource Conference', 'https://uofriverside.com/2027-spring-global-human-resource-conference/', '2027-04-15', { organization: 'University of Riverside', location: 'Los Angeles, California, United States' }),
    row('2027 Spring Global Management Conference', 'http://uofriverside.com/2027-spring-global-management-conference/', '2027-03-18', { organization: 'University of Riverside', location: 'Los Angeles, California, United States' }),
  ],
  [
    'West East Institute: two co-located Miami conferences on the same day',
    row('The WEI International Academic Conference on Technology and Science Education (WEI-TSE-Miami 2027)', 'https://www.westeastinstitute.com/miami-2027-international-conference-on-technology-and-science-education/', '2027-04-13', { organization: 'West East Institute', location: 'Miami, Florida, United States' }),
    row('The WEI International Academic Conference on Education & Humanities, and Social Sciences (WEI-EHSS-Miami 2027)', 'https://www.westeastinstitute.com/miami-2027-international-conference-on-educationhumanities-and-social-sciences/', '2027-04-13', { organization: 'West East Institute', location: 'Miami, United States' }),
  ],
  [
    'Cloud Native Summit 2027 vs Cloud Native Valencia',
    row('Cloud Native Summit 2027', 'https://cloudnativesummit.de', '2027-06-13'),
    row('Cloud Native Valencia', 'https://cloudnativevalencia.com', '2026-12-09'),
  ],
];
