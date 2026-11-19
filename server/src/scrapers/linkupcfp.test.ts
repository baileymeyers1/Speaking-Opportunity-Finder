import { describe, it, expect } from 'vitest';
import { isLikelyCFP, mapToScraperResult } from './linkupcfp.js';

const CALL = 'The call for speakers is open: submit a talk by March 3, 2027. The conference takes place in Austin, TX.';

function hit(overrides: Partial<{ name: string; url: string; content: string }> = {}) {
  return { name: 'Texas Logistics Summit 2027', url: 'https://txlogistics.example/speak', content: CALL, ...overrides };
}

describe('isLikelyCFP', () => {
  it('accepts call wording in the text and "cfp" as a path or host segment', () => {
    expect(isLikelyCFP(CALL, 'https://example.org/speak')).toBe(true);
    expect(isLikelyCFP('Submissions are welcome.', 'https://example.org/cfp')).toBe(true);
    expect(isLikelyCFP('Submissions are welcome.', 'https://cfp.example.org/2027')).toBe(true);
    expect(isLikelyCFP('The CFP closes on Friday.', 'https://example.org/news')).toBe(true);
  });

  it('does not take the Certified Financial Planner credential for a call for papers', () => {
    expect(isLikelyCFP('Jayne W. Di Vincenzo, CFP® is president of Lions Bridge Financial Advisors.', 'https://example.org/team/jayne')).toBe(false);
    expect(isLikelyCFP('She is a Certified Financial Planner (CFP) with 20 years of experience.', 'https://example.org/about')).toBe(false);
  });

  it('does not match "cfp" inside another word of the URL', () => {
    expect(isLikelyCFP('Member portal sign in.', 'https://cfpmemberportal.example.org/login')).toBe(false);
  });
});

describe('mapToScraperResult', () => {
  it('stores a call page as a Linkup Search row with the query format and industries', () => {
    expect(mapToScraperResult(hit(), ['logistics'], 'conference')).toMatchObject({
      title: 'Texas Logistics Summit 2027',
      applyUrl: 'https://txlogistics.example/speak',
      source: 'Linkup Search',
      format: 'conference',
      industries: ['logistics'],
    });
  });

  it('drops pages that do not mention a call', () => {
    expect(mapToScraperResult(hit({ content: 'Register now to attend three days of keynotes.' }), [], 'conference')).toBeNull();
  });

  it.each([
    'https://www.linkedin.com/in/brandon-dudas-372bb4269/',
    'https://www.linkedin.com/posts/some-org_call-for-speakers-activity-7',
    'https://www.facebook.com/events/1234567890',
  ])('drops a social page even when it mentions a call: %s', (url) => {
    expect(mapToScraperResult(hit({ url }), [], 'conference')).toBeNull();
  });

  it.each([
    'Guide To Submitting To Conferences: How to Answer a Call for Papers',
    'Top 10 Supply Chain Conferences to Attend in 2027',
  ])('drops an article about calls: %s', (name) => {
    expect(mapToScraperResult(hit({ name }), [], 'conference')).toBeNull();
  });

  it('still skips the aggregators that are scraped as sources of their own', () => {
    expect(mapToScraperResult(hit({ url: 'https://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=1' }), [], 'conference')).toBeNull();
  });
});
