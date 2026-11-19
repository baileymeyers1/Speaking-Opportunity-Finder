import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildGuestRequestResults,
  chargesGuests,
  industriesFromCategories,
  inferGuestRequestFormat,
  parseGuestRequestFeed,
  parseGuestRequestFields,
  type GuestRequest,
} from './radioGuestList.js';

// Eight items of radioguestlist.com/guestrequests?format=rss as served on
// 2026-11-18, one per shape seen in the feed; booking e-mail addresses were
// replaced with a placeholder.
const feedXml = readFileSync(join(__dirname, '__fixtures__', 'radioguestlist-guestrequests.rss'), 'utf8');
const requests = parseGuestRequestFeed(feedXml);
const byShow = (name: string) => requests.find((request) => request.showName === name);

function makeRequest(overrides: Partial<GuestRequest> = {}): GuestRequest {
  return {
    url: 'https://radioguestlist.com/guestrequests/1-a-show-seeks-guests',
    showName: 'A Show',
    seeking: 'Guests',
    categories: [],
    showFormats: ['Recorded podcast'],
    ...overrides,
  };
}

describe('parseGuestRequestFeed', () => {
  it('reads the guest requests and skips the sponsored guest profile', () => {
    expect(feedXml.match(/<item>/g)).toHaveLength(8);
    expect(requests.map((request) => request.showName)).toEqual([
      "It's Your Break",
      'Technically Socially Aware',
      'Catch the Story! Podcast',
      'Digital Marketing Stories',
      'NightRaven Radio Program',
      'Mind in Motion',
      'The My Future Business Show',
    ]);
  });

  it('reads the show, who it wants and where the request lives', () => {
    const request = byShow('Technically Socially Aware');
    expect(request).toMatchObject({
      url: 'https://radioguestlist.com/guestrequests/8271-technically-socially-aware-seeks-instructional-designers',
      seeking: 'Instructional Designers',
      categories: [
        'Politics and Society Podcasts', 'Web/Tech Shows', 'Business Podcasts', 'General Interest Shows',
        'Recorded podcast', 'h',
      ],
      summary:
        'Is seeking Instructional Designers and Educational Technologists to converse about instructional design across K-12, Higher Ed, and corporate training for upcoming 2027 episodes.',
      showFormats: ['Recorded podcast', 'Video webcast'],
      guestFees: "No fees. I don't charge for guests; I'm just trying to grow my show!",
      website: 'https://open.spotify.com/show/3ez49naMB06ha5OSduzsoP',
    });
    expect(request?.showDescription).toMatch(/^Technically Socially Aware is a left-leaning podcast/);
    expect(request?.showDescription).toMatch(/recruiting guests for 2027!$/);
  });

  it('takes the show name from the form, which keeps the punctuation the post title drops', () => {
    expect(feedXml).toContain('<title>#8273: Its Your Break seeks Entertainers and Performers</title>');
    expect(byShow("It's Your Break")?.seeking).toBe('Entertainers and Performers');
  });

  it('reads an answer that shares its line with the label', () => {
    const request = byShow("It's Your Break");
    expect(request?.guestRequest).toMatch(/^We’re interested in the experiences that shaped the person behind the entertainer/);
    expect(request?.guestRequest).toMatch(/are welcome to submit\.$/);
    // The answer does not run on into the next field.
    expect(request?.guestRequest).not.toMatch(/Jonathan Mertz|Show Host/);
  });

  it('reads a post title without the colon after its number', () => {
    expect(feedXml).toContain('<title>#8188 Mind In Motion seeks Social Behavior Experts</title>');
    expect(byShow('Mind in Motion')?.seeking).toBe('Social Behavior Experts');
  });

  it('keeps a form question it does not know out of the answers around it', () => {
    // This request uses an older form whose airing question is worded differently.
    const request = byShow('The My Future Business Show');
    expect(feedXml).toContain('Station Call Letters + Network(s) + Broadcast Schedule + Time Zone + Format: *');
    expect(request?.showFormats).toEqual(['Recorded podcast']);
    expect(request?.showDescription).not.toMatch(/pre-recorded in a relaxing/);
    expect(request?.website).toBe('https://myfuturebusiness.com');
  });

  it('returns nothing for a feed without requests', () => {
    expect(parseGuestRequestFeed('<rss><channel><title>Guest Requests</title></channel></rss>')).toEqual([]);
  });
});

describe('parseGuestRequestFields', () => {
  it('splits the body on the form labels', () => {
    const fields = parseGuestRequestFields(
      '<h3><strong>Is seeking gardeners.</strong></h3>' +
        '<p><strong>Show Name: *</strong></p><p>The Potting Shed</p>' +
        '<p><strong>Show Format: *</strong></p><ul><li><p>Recorded podcast</p></li><li><p>Video webcast</p></li></ul>' +
        '<p><strong>When, where, and how does your show air? </strong>(share details about Network(s) + Schedule, etc): <strong>*</strong></p>' +
        '<p>Weekly on all platforms.</p>' +
        '<p><strong>How many episodes have you already produced? *</strong></p><ul><li><p>26-50</p></li></ul>' +
        '<p><strong>We do not encourage this but if you charge for interviews, what do guests get back? *</strong></p>' +
        '<p><strong>No charge.</strong></p>',
    );
    expect(fields).toEqual({
      intro: ['Is seeking gardeners.'],
      showName: ['The Potting Shed'],
      showFormat: ['Recorded podcast', 'Video webcast'],
      airs: ['Weekly on all platforms.'],
      episodes: ['26-50'],
      guestFees: ['No charge.'],
    });
  });
});

describe('chargesGuests', () => {
  it('is true only when the show names a price', () => {
    expect(chargesGuests(byShow('Catch the Story! Podcast')!)).toBe(true);
    expect(chargesGuests(byShow('The My Future Business Show')!)).toBe(true);
    expect(chargesGuests(byShow('Mind in Motion')!)).toBe(false);
    expect(chargesGuests(makeRequest({ guestFees: 'No charge.' }))).toBe(false);
    expect(chargesGuests(makeRequest({ guestFees: undefined }))).toBe(false);
    expect(chargesGuests(makeRequest({ guestFees: 'A 25-minute interview is $250.00.' }))).toBe(true);
  });
});

describe('inferGuestRequestFormat', () => {
  it('labels on-demand and online shows as podcasts', () => {
    expect(inferGuestRequestFormat(makeRequest({ showFormats: ['Recorded podcast', 'Video webcast'] }))).toBe('podcast');
    expect(inferGuestRequestFormat(byShow('NightRaven Radio Program')!)).toBe('podcast');
    expect(inferGuestRequestFormat(makeRequest({ showFormats: ['Broadcast radio show', 'Recorded podcast'] }))).toBe('podcast');
    expect(inferGuestRequestFormat(makeRequest({ showFormats: ['Other'] }))).toBe('podcast');
    expect(inferGuestRequestFormat(makeRequest({ showFormats: [] }))).toBe('podcast');
  });

  it('labels a show that only airs on broadcast radio or television as other', () => {
    expect(inferGuestRequestFormat(makeRequest({ showFormats: ['Broadcast radio show'] }))).toBe('other');
    expect(inferGuestRequestFormat(makeRequest({ showFormats: ['Satellite radio', 'TV show'] }))).toBe('other');
  });
});

describe('industriesFromCategories', () => {
  it('turns subject categories into tags and drops the ones about the medium', () => {
    expect(
      industriesFromCategories([
        'Politics and Society Podcasts', 'Web/Tech Shows', 'Business Podcasts', 'General Interest Shows',
        'Recorded podcast', 'h',
      ]),
    ).toEqual(['politics', 'society', 'technology', 'business']);
    expect(industriesFromCategories(['Movies & TV Shows', 'Video Games & eSports Podcasts'])).toEqual([
      'film', 'television', 'gaming', 'esports',
    ]);
    expect(industriesFromCategories(['Womens Issues', 'Christian', 'Books and Authors Podcasts', 'Music Podcast'])).toEqual([
      "women's issues", 'religion', 'books', 'music',
    ]);
    expect(industriesFromCategories(['Video Livestream', 'UK-based', 'x', 'Internet radio show'])).toEqual([]);
  });

  it('keeps at most five tags without repeats', () => {
    expect(
      industriesFromCategories([
        'Health & Wellness Podcasts', 'Self Improvement Podcasts', 'Wellness Podcasts', 'Arts & Culture Podcasts',
        'Sports Podcasts',
      ]),
    ).toEqual(['health', 'wellness', 'self improvement', 'arts', 'culture']);
  });
});

describe('buildGuestRequestResults', () => {
  const results = buildGuestRequestResults(requests);

  it('leaves out the shows that charge their guests', () => {
    expect(results.map((result) => result.organization)).toEqual([
      "It's Your Break",
      'Technically Socially Aware',
      'Digital Marketing Stories',
      'NightRaven Radio Program',
      'Mind in Motion',
    ]);
  });

  it('maps a guest request to a podcast opportunity that links to the request page', () => {
    const result = results.find((candidate) => candidate.organization === 'Digital Marketing Stories');
    expect(result).toMatchObject({
      title: 'Digital Marketing Stories seeks Seasoned Digital Marketers',
      location: null,
      isRemote: true,
      format: 'podcast',
      industries: ['business', 'marketing', 'technology', "women's issues"],
      compensationType: 'exposure',
      applyUrl: 'https://radioguestlist.com/guestrequests/8267-digital-marketing-stories-seeks-seasoned-digital-marketers',
      source: 'radioguestlist.com',
      sourceUrl: 'https://www.bdwjb.com/',
    });
    expect(result?.eventDate).toBeUndefined();
    expect(result?.cfpDeadline).toBeUndefined();
    expect(result?.compensationDetails).toMatch(/^Unpaid guest interview\. The show on guest fees: No fees\./);
    expect(result?.compensationDetails?.length).toBeLessThanOrEqual(300);
  });

  it('describes who the show wants, then the show', () => {
    const [first] = results;
    expect(first.description).toMatch(
      /^It's Your Break is seeking interview guests from music, theater, film, television, and comedy/,
    );
    expect(first.description).toMatch(/are welcome to submit\. About the show: It’s Your Break is a podcast hosted by/);
    expect(first.description?.length).toBeLessThanOrEqual(2000);
  });

  it('never copies a booking address into the description', () => {
    expect(feedXml).toContain('booking@example.org');
    for (const result of results) expect(result.description).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    const [withAddress] = buildGuestRequestResults([
      makeRequest({ summary: 'Is seeking chefs.', guestRequest: 'Write to bookings@show.example to pitch.' }),
    ]);
    expect(withAddress.description).toBe('A Show is seeking chefs. Write to the address on the request page to pitch.');
  });

  it('falls back to the title when the request has no summary, and to the request page without a website', () => {
    const [bare] = buildGuestRequestResults([makeRequest({ seeking: 'Beekeepers' })]);
    expect(bare.description).toBe('A Show is seeking Beekeepers.');
    expect(bare.sourceUrl).toBe(bare.applyUrl);
    expect(bare.compensationDetails).toBe('Unpaid guest interview.');
  });
});
