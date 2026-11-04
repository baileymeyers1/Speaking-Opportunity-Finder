import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({ prisma: {} }));

import { summarizeEventGroups } from './events.js';

describe('summarizeEventGroups', () => {
  it('counts events, rows per event, and events spanning sources or years', () => {
    const summary = summarizeEventGroups([
      { eventId: 'fosdem', source: 'confs.tech', editionYear: 2027, count: 1 },
      { eventId: 'fosdem', source: 'wikicfp.com', editionYear: 2027, count: 1 },
      { eventId: 'fosdem', source: 'confs.tech', editionYear: 2026, count: 1 },
      { eventId: 'lonely', source: 'pretalx.com', editionYear: 2027, count: 1 },
      { eventId: 'undated', source: 'linkup', editionYear: null, count: 2 },
    ]);
    expect(summary).toEqual({ events: 3, linkedRows: 6, rowsPerEvent: 2, multiSourceEvents: 1, multiYearEvents: 1 });
  });

  it('is all zeros with no linked rows', () => {
    expect(summarizeEventGroups([])).toEqual({ events: 0, linkedRows: 0, rowsPerEvent: 0, multiSourceEvents: 0, multiYearEvents: 0 });
  });
});
