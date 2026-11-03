import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildPretalxResults,
  parsePretalxCfpPage,
  parsePretalxEventList,
  type FetchedCfpPage,
} from './pretalx.js';

const fixturesDir = join(__dirname, '__fixtures__');
const eventList: unknown = JSON.parse(readFileSync(join(fixturesDir, 'pretalx-events.json'), 'utf8'));
const cfpHtml = (slug: string) => readFileSync(join(fixturesDir, `pretalx-cfp-${slug}.html`), 'utf8');
const now = new Date('2026-11-03T12:00:00Z');
const instance = 'https://pretalx.com';

describe('parsePretalxEventList', () => {
  const events = parsePretalxEventList(eventList, now, instance);

  it('keeps public events that have not started, soonest first', () => {
    // Fixture: 9 events; qubes-os-summit-2026 is past, hidden-test is not public.
    expect(events.map((event) => event.slug)).toEqual([
      'democon',
      'pydata-global-2026',
      'bsides-london-2026',
      'bsidessf-2027',
      'kcd-texas-2027',
      'ossfe2027',
      'thotcon-0xe',
    ]);
  });

  it('reads the English name and the start date', () => {
    const ossfe = events.find((event) => event.slug === 'ossfe2027');
    expect(ossfe?.name).toBe('OSSFE 2027');
    expect(ossfe?.dateFrom.toISOString()).toBe('2027-06-01T00:00:00.000Z');
    expect(ossfe?.dateTo?.toISOString()).toBe('2027-06-04T00:00:00.000Z');
  });

  it('accepts a paginated envelope and rejects anything else', () => {
    expect(parsePretalxEventList({ results: eventList }, now, instance)).toHaveLength(7);
    expect(parsePretalxEventList({ detail: 'error' }, now, instance)).toEqual([]);
    expect(parsePretalxEventList('nope', now, instance)).toEqual([]);
  });
});

describe('parsePretalxCfpPage', () => {
  it('reads an open CFP with its deadline and custom-domain URL', () => {
    const page = parsePretalxCfpPage(cfpHtml('ossfe2027'));
    expect(page.status).toBe('open');
    expect(page.cfpDeadline?.toISOString()).toBe('2026-11-11T00:00:00.000Z');
    expect(page.title).toBe('OSSFE 2027');
    expect(page.canonicalUrl).toBe('https://cfp.ossfe.org/ossfe2027/cfp');
    expect(page.description).toMatch(/^We want to hear from maintainers/);
    expect(page.description).not.toMatch(/Submissions close on|Submit a proposal/);
  });

  it('marks a CFP that has not opened yet', () => {
    const page = parsePretalxCfpPage(cfpHtml('thotcon-0xe'));
    expect(page.status).toBe('not-yet-open');
    expect(page.opensAt?.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(page.cfpDeadline).toBeUndefined();
    expect(page.description).toMatch(/Chicago, IL/);
  });

  it('marks a closed CFP', () => {
    const page = parsePretalxCfpPage(cfpHtml('bsides-london-2026'));
    expect(page.status).toBe('closed');
    expect(page.cfpDeadline).toBeUndefined();
  });

  it('keeps an open CFP that states no deadline', () => {
    const page = parsePretalxCfpPage(cfpHtml('pydata-global-2026'));
    expect(page.status).toBe('open');
    expect(page.cfpDeadline).toBeUndefined();
  });

  it('reads the deadline from localized status lines', () => {
    // Japanese locale: English wording, slash dates.
    const tokyo = parsePretalxCfpPage(cfpHtml('juliacon-local-tokyo-2026'));
    expect(tokyo.status).toBe('open');
    expect(tokyo.cfpDeadline?.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(tokyo.title).toBe('JuliaCon Local Tokyo 2026');

    // German locale: "Einreichungen sind bis 28.02.2027 23:59 (Europe/Berlin) möglich".
    const bonn = parsePretalxCfpPage(cfpHtml('dvrw-2027'));
    expect(bonn.status).toBe('open');
    expect(bonn.cfpDeadline?.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(bonn.description).not.toMatch(/Einreichungen sind bis/);
  });

  it('treats an empty status line as open with no deadline', () => {
    const page = parsePretalxCfpPage(cfpHtml('tit2026te'));
    expect(page.status).toBe('open');
    expect(page.cfpDeadline).toBeUndefined();
    expect(page.opensAt).toBeUndefined();
  });

  it('keeps the description to the CFP text', () => {
    const page = parsePretalxCfpPage(cfpHtml('bsidessf-2027'));
    expect(page.status).toBe('open');
    expect(page.cfpDeadline?.toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(page.description).toMatch(/San Francisco/);
    expect(page.description!.length).toBeLessThanOrEqual(1500);
  });
});

describe('buildPretalxResults', () => {
  const events = parsePretalxEventList(eventList, now, instance);
  const pages = new Map<string, FetchedCfpPage>([
    ['ossfe2027', { html: cfpHtml('ossfe2027'), finalUrl: 'https://cfp.ossfe.org/ossfe2027/cfp' }],
    ['thotcon-0xe', { html: cfpHtml('thotcon-0xe'), finalUrl: 'https://cfp.thotcon.org/thotcon-0xe/cfp' }],
    ['bsides-london-2026', { html: cfpHtml('bsides-london-2026') }],
    ['pydata-global-2026', { html: cfpHtml('pydata-global-2026') }],
    ['bsidessf-2027', { html: cfpHtml('bsidessf-2027') }],
  ]);
  const results = buildPretalxResults(events, pages, now);

  it('keeps only CFPs that accept proposals now', () => {
    // Not yet open (thotcon), closed (bsides-london) and unfetched pages are dropped.
    expect(results.map((result) => result.title).sort()).toEqual(['BSidesSF 2027', 'OSSFE 2027', 'PyData Global 2026']);
  });

  it('maps dates, source and URLs', () => {
    const ossfe = results.find((result) => result.title === 'OSSFE 2027')!;
    expect(ossfe.applyUrl).toBe('https://cfp.ossfe.org/ossfe2027/cfp');
    expect(ossfe.sourceUrl).toBe('https://pretalx.com/ossfe2027/');
    expect(ossfe.eventDate?.toISOString()).toBe('2027-06-01T00:00:00.000Z');
    expect(ossfe.cfpDeadline?.toISOString()).toBe('2026-11-11T00:00:00.000Z');
    expect(ossfe.source).toBe('pretalx.com');
    expect(ossfe.format).toBe('conference');

    const pydata = results.find((result) => result.title === 'PyData Global 2026')!;
    expect(pydata.applyUrl).toBe('https://pretalx.com/pydata-global-2026/cfp');
    expect(pydata.cfpDeadline).toBeUndefined();
  });

  it('drops an open CFP whose deadline has passed', () => {
    const later = new Date('2026-11-20T12:00:00Z');
    const titles = buildPretalxResults(events, pages, later).map((result) => result.title);
    expect(titles).not.toContain('OSSFE 2027');
    expect(titles).toContain('PyData Global 2026');
  });
});
