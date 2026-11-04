import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({ prisma: {} }));

import { buildEventContext } from './eventContext.js';

const d = (iso: string) => new Date(iso);

function edition(overrides: Partial<Parameters<typeof buildEventContext>[1][number]> & { id: string }) {
  return {
    eventId: 'event-1',
    editionYear: 2027,
    title: 'FOSDEM 2027',
    source: 'developers.events',
    applyUrl: `https://fosdem.org/${overrides.id}`,
    cfpDeadline: d('2026-12-01T11:59:59Z'),
    eventDate: d('2027-01-30T00:00:00Z'),
    createdAt: d('2026-10-01T00:00:00Z'),
    isClosed: false,
    ...overrides,
  };
}

describe('buildEventContext', () => {
  const me = { id: 'a', eventId: 'event-1', editionYear: 2027, source: 'developers.events', eventDate: d('2027-01-30T00:00:00Z') };

  it('lists the other sources of the same edition, sorted and without its own', () => {
    const context = buildEventContext(me, [
      edition({ id: 'a' }),
      edition({ id: 'b', source: 'wikicfp.com' }),
      edition({ id: 'c', source: 'confs.tech' }),
      edition({ id: 'd', source: 'confs.tech' }),
      edition({ id: 'e', source: 'pretalx.com', editionYear: 2026 }),
    ]);
    expect(context.alsoListedOn).toEqual(['confs.tech', 'wikicfp.com']);
  });

  it('turns earlier years into one previous edition per year, newest first, first-seen row winning', () => {
    const context = buildEventContext(me, [
      edition({ id: 'a' }),
      edition({ id: 'b', editionYear: 2026, source: 'wikicfp.com', createdAt: d('2025-11-15T00:00:00Z'), cfpDeadline: d('2025-12-01T00:00:00Z'), eventDate: d('2026-01-31T00:00:00Z') }),
      edition({ id: 'c', editionYear: 2026, source: 'confs.tech', createdAt: d('2025-10-20T00:00:00Z'), cfpDeadline: null, eventDate: d('2026-01-31T00:00:00Z') }),
      edition({ id: 'd', editionYear: 2025, createdAt: d('2024-10-01T00:00:00Z'), cfpDeadline: d('2024-12-01T00:00:00Z'), eventDate: d('2025-02-01T00:00:00Z') }),
    ]);
    expect(context.previousEditions.map((e) => e.year)).toEqual([2026, 2025]);
    expect(context.previousEditions[0].firstSeenAt).toEqual(d('2025-10-20T00:00:00Z'));
    // The earliest-seen row had no deadline; the other row of that year supplies it.
    expect(context.previousEditions[0].cfpDeadline).toEqual(d('2025-12-01T00:00:00Z'));
  });

  it('ignores later years and rows with no year at all for previous editions', () => {
    const context = buildEventContext(me, [
      edition({ id: 'a' }),
      edition({ id: 'b', editionYear: 2028, eventDate: d('2028-01-29T00:00:00Z') }),
      edition({ id: 'c', editionYear: null, eventDate: null }),
    ]);
    expect(context.previousEditions).toEqual([]);
    // An undated sibling still counts as another listing of this edition.
    expect(context.alsoListedOn).toEqual([]);
  });

  it('falls back to the event date for a sibling without an edition year', () => {
    const context = buildEventContext(me, [
      edition({ id: 'a' }),
      edition({ id: 'b', editionYear: null, eventDate: d('2026-01-31T00:00:00Z'), createdAt: d('2025-10-01T00:00:00Z') }),
    ]);
    expect(context.previousEditions.map((e) => e.year)).toEqual([2026]);
  });

  it('is empty for a row with no event', () => {
    expect(buildEventContext({ ...me, eventId: null }, [])).toEqual({ alsoListedOn: [], previousEditions: [] });
  });
});
