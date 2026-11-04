import { describe, expect, it } from 'vitest';
import { getDeadlineBadge } from './opportunityDisplay';

// Runs under TZ=America/Los_Angeles: `new Date(y, m, d, h)` is Pacific time.
describe('getDeadlineBadge', () => {
  const elevenPmPacificNov30 = new Date(2026, 10, 30, 23, 0, 0);

  it('labels a missing deadline', () => {
    expect(getDeadlineBadge({ cfpDeadline: null }).label).toBe('No deadline');
  });

  it('keeps a legacy "Nov 30" deadline open at 11 PM Pacific on Nov 30', () => {
    const badge = getDeadlineBadge({ cfpDeadline: '2026-11-30T00:00:00.000Z', deadlineTimezone: null }, elevenPmPacificNov30);
    expect(badge).toEqual({ label: '1d left', variant: 'destructive' });
  });

  it('closes a deadline once its instant has passed', () => {
    const badge = getDeadlineBadge({ cfpDeadline: '2026-12-01T11:59:59.000Z', deadlineTimezone: 'AoE' }, new Date(2026, 11, 1, 4, 0));
    expect(badge).toEqual({ label: 'Closed', variant: 'destructive' });
  });

  it('warns inside a week and shows the closing day beyond it', () => {
    const now = new Date(2026, 10, 25, 9, 0);
    expect(getDeadlineBadge({ cfpDeadline: '2026-12-01T11:59:59.000Z', deadlineTimezone: 'AoE' }, now).label).toBe('6d left');
    expect(getDeadlineBadge({ cfpDeadline: '2026-12-01T11:59:59.000Z', deadlineTimezone: 'AoE' }, now).variant).toBe('outline');
    const far = getDeadlineBadge({ cfpDeadline: '2027-01-16T04:59:59.000Z', deadlineTimezone: 'America/Denver' }, now);
    expect(far).toEqual({ label: 'Jan 15, 2027', variant: 'secondary' });
  });
});
