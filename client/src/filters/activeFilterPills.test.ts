import { describe, expect, it } from 'vitest';
import { buildActiveFilterPills } from './activeFilterPills';

describe('buildActiveFilterPills', () => {
  it('shows a sector by its label and removes only that sector', () => {
    const pills = buildActiveFilterPills({ sectors: ['pr-communications', 'hr'] });
    expect(pills.map((pill) => pill.label)).toEqual(['PR & Communications', 'HR, Talent & Workplace']);
    expect(pills[0].next).toEqual({ sectors: ['hr'] });
  });

  it('drops the filter key when the last sector is removed', () => {
    const [pill] = buildActiveFilterPills({ sectors: ['legal'], isRemote: true });
    expect(pill.next).toEqual({ sectors: undefined, isRemote: true });
  });

  it('still shows a free-text industry from an old link so it can be removed', () => {
    const pills = buildActiveFilterPills({ industries: ['devops'] });
    expect(pills.map((pill) => pill.label)).toEqual(['Devops']);
    expect(pills[0].next).toEqual({ industries: undefined });
  });

  it('lists formats first, then sectors', () => {
    const pills = buildActiveFilterPills({ sectors: ['ai'], format: ['podcast'] });
    expect(pills.map((pill) => pill.label)).toEqual(['Podcast', 'AI & Machine Learning']);
  });
});
