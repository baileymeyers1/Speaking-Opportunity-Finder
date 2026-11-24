import { describe, it, expect } from 'vitest';
import { callSignal, looksLikeArticle, looksLikeDirectory, readPriority } from './liveHitTriage.js';

const hit = (title: string, description = '', applyUrl = 'https://example.org/page') => ({ title, description, applyUrl });

describe('looksLikeArticle', () => {
  it.each([
    'How to Use AI in Public Relations: Tools, Prompts, and Best Practices',
    'PR and AI: 21 ways artificial intelligence is changing the PR game',
    'AI in PR: What you need to know | Muck Rack',
    'Best AI Tools for PR Agencies (2026): What Actually Works',
    '12 Bingeworthy PR Podcasts to Follow in 2026 | Cision',
    'Top 10 AI Conferences to Attend in 2027',
    'TrizCom PR Blog: Insights and Trends in Public Relations',
    'AI in Public Relations: Definition, Benefits & Examples',
  ])('drops "%s"', (title) => {
    expect(looksLikeArticle(hit(title))).toBe(true);
  });

  it('drops Reddit threads', () => {
    expect(looksLikeArticle(hit('AI in PR', '', 'https://www.reddit.com/r/PublicRelations/comments/x'))).toBe(true);
  });

  it.each([
    'https://www.linkedin.com/in/brandon-dudas-372bb4269/',
    'https://www.linkedin.com/showcase/digital-transformation-conference',
    'https://uk.linkedin.com/posts/someone_call-for-speakers-activity-1',
    'https://www.facebook.com/events/1234567890',
    'https://x.com/someconf/status/1',
    'https://www.youtube.com/watch?v=abc',
  ])('drops a social page, which is never the event\'s own: %s', (applyUrl) => {
    expect(looksLikeArticle(hit('Oil & Gas Digital Transformation Conference 2027', 'Call for sessions is open', applyUrl))).toBe(true);
  });

  it('keeps a page whose host only ends in the same letters', () => {
    expect(looksLikeArticle(hit('Annex Conference 2027', '', 'https://annex.com/cfp'))).toBe(false);
  });

  it.each([
    '4th Annual AI Implementation for Communications Conference | Mar 23–25, 2027, New York City',
    'Practical AI for Communications Virtual Conference | Jan 20–21, 2027',
    'TU Dublin Announces Call for Papers for the Fourth Annual SymPRandA Symposium',
    'PR & COMMS 2026 – The Future of AI-Powered PR & Communications Summit',
    'Swaay.Health LIVE 2027',
    'The Future of PR: Gaining an AI Edge',
  ])('keeps "%s"', (title) => {
    expect(looksLikeArticle(hit(title))).toBe(false);
  });
});

describe('callSignal', () => {
  it('ranks an explicit call above an event page above an article-ish page', () => {
    const call = callSignal(hit('SymPRandA Symposium', 'Call for papers: submit your abstract by 15 January 2027.'));
    const event = callSignal(hit('Practical AI for Communications Virtual Conference | Jan 20–21, 2027'));
    const other = callSignal(hit('The State of AI in PR 2026 | Muck Rack'));
    expect(call).toBeGreaterThan(event);
    expect(event).toBeGreaterThan(other);
  });

  it('counts speaker-call wording in the title or the snippet', () => {
    expect(callSignal(hit('Speakers wanted: AI in Comms webinar series'))).toBeGreaterThan(0);
    expect(callSignal(hit('Comms Summit', 'Apply to speak at our 2027 summit'))).toBeGreaterThan(0);
  });
});

describe('pay-to-present aggregators', () => {
  it.each([
    'https://conferenceinusa.com/cities/california/energy',
    'https://www.allconferencealert.com/usa/energy',
    'https://conferencealerts.co.in/california/energy',
    'https://www.conferenceineurope.org/los-angeles/energy',
  ])('drops %s, whose pages are never an event', (applyUrl) => {
    expect(looksLikeArticle(hit('Energy Conference in California 2026', 'Call for papers open', applyUrl))).toBe(true);
  });
});

// Titles from a live search for "Energy" in California, 2026-11-24.
describe('looksLikeDirectory', () => {
  it.each([
    'Energy Conferences & Events in the US — Sovereignty Founders',
    'Events - California Energy Commission',
    'Calendar — California Solar & Storage Assoc. (CALSSA)',
    'Webinars - Clean Energy Group',
    'Energy Sector, Webinars | JD Supra',
    'Upcoming Energy Conferences in USA 2026-2027',
    'Energy Conferences in USA 2026 & 2027 | ACA',
    'Energy Conferences in California 2026–27',
  ])('takes "%s" for a list of events', (title) => {
    expect(looksLikeDirectory(hit(title))).toBe(true);
  });

  it.each([
    'Energy Conference 2026: Call for Speakers - OATI',
    'CALL FOR SPEAKERS - The Battery Show Asia',
    'Solar Valley Consortium 2026 Virtual Conference - UC Riverside',
    '2027 Carbon Solutions Forum + Geothermal Day - Energy Dialogues',
    'California Powers Up: Energy & Policy Solutions Summit August 11, 2026',
    'ICICT 2027 - 10th International Conference on Information and Computer Technologies',
    'Expo West 2027 - 15 March, Anaheim',
  ])('takes "%s" for one event', (title) => {
    expect(looksLikeDirectory(hit(title))).toBe(false);
  });

  it('never takes a title that asks for speakers for a list', () => {
    expect(looksLikeDirectory(hit('Call for Speakers | Events Industry Council 2027'))).toBe(false);
  });
});

describe('readPriority', () => {
  it('reads a call first, then an event page, then the rest, and a list of events last', () => {
    const order = [
      hit('Upcoming Energy Conferences in USA 2026-2027', 'Call for papers, submit your abstract'),
      hit('Energy Policy Notes'),
      hit('Clean Energy Summit | March 3, 2027'),
      hit('Energy Conference 2026: Call for Speakers - OATI'),
    ].sort((a, b) => readPriority(b) - readPriority(a));
    expect(order.map((h) => h.title)).toEqual([
      'Energy Conference 2026: Call for Speakers - OATI',
      'Clean Energy Summit | March 3, 2027',
      'Energy Policy Notes',
      'Upcoming Energy Conferences in USA 2026-2027',
    ]);
  });
});
