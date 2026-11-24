import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { nextDate, parseCivicTechCalendar } from './civicTechGuide.js';
import { worthReading } from './common.js';

const html = readFileSync(fileURLToPath(new URL('../__fixtures__/civictech-calendar.html', import.meta.url)), 'utf8');
const NOW = new Date('2026-11-24T12:00:00Z');

describe('parseCivicTechCalendar', () => {
  const events = parseCivicTechCalendar(html, NOW);

  it('keeps events and open calls, not funding or jobs', () => {
    expect(events).toHaveLength(25);
    expect(events.filter((event) => event.deadline)).toHaveLength(8);
    expect(events.some((event) => event.name === 'OTF Rapid Response Fund RFP')).toBe(false);
  });

  it("takes an open call's date as when it closes, with the guide's page for it", () => {
    const call = events.find((event) => event.name.startsWith('Research proposals for the second symposium'));
    expect(call).toMatchObject({
      url: 'https://civictech.guide/calendar/hbf92ran7pmeml46ti0si643fk',
      deadline: new Date('2026-11-24T00:00:00Z'),
      tags: ['civic tech'],
    });
    expect(call?.startDate).toBeUndefined();
    expect(call?.description).toBeTruthy();
  });

  it("takes an event's date as when it starts", () => {
    const event = events.find((entry) => entry.name.startsWith('Learning Call: Go East'));
    expect(event?.startDate).toEqual(new Date('2026-11-24T00:00:00Z'));
    expect(event?.deadline).toBeUndefined();
  });

  it('leaves out an event starting this week, and keeps a call open today', () => {
    const kept = events.filter((event) => worthReading(event, NOW));
    expect(kept.some((event) => event.name.startsWith('Learning Call: Go East'))).toBe(false);
    expect(kept.some((event) => event.name.startsWith('Research proposals for the second symposium'))).toBe(true);
  });
});

describe('nextDate', () => {
  it('puts a month and day in this year unless it is more than a week gone', () => {
    expect(nextDate(10, 20, NOW)).toEqual(new Date('2026-11-20T00:00:00Z'));
    expect(nextDate(1, 3, NOW)).toEqual(new Date('2027-02-03T00:00:00Z'));
    expect(nextDate(11, 31, NOW)).toEqual(new Date('2026-12-31T00:00:00Z'));
  });
});
