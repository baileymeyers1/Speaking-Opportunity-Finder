import { describe, it, expect } from 'vitest';
import { alsoListedOnText, previousEditionHint, sourceLabel } from './eventHints';

const NOW = new Date('2026-11-04T12:00:00Z');

describe('sourceLabel and alsoListedOnText', () => {
  it('maps source ids to readable names and passes unknown ones through', () => {
    expect(sourceLabel('wikicfp.com')).toBe('WikiCFP');
    expect(sourceLabel('pretalx.com')).toBe('Pretalx');
    expect(sourceLabel('some.new.source')).toBe('some.new.source');
  });

  it('builds the "Also on" line and returns null when nothing else lists the call', () => {
    expect(alsoListedOnText(['wikicfp.com', 'pretalx.com'])).toBe('Also on WikiCFP, Pretalx');
    expect(alsoListedOnText([])).toBeNull();
    expect(alsoListedOnText(undefined)).toBeNull();
  });
});

describe('previousEditionHint', () => {
  const edition = { year: 2026, cfpDeadline: '2026-06-01T11:59:59Z', eventDate: '2026-09-10T00:00:00Z', firstSeenAt: '2026-03-12T08:00:00Z' };

  it("says last year's call opened around the day it was first stored", () => {
    expect(previousEditionHint({ editionYear: 2027, previousEditions: [edition] }, NOW)).toEqual({
      text: "Last year's CFP opened around 12 Mar",
      detail: 'The 2026 call was first listed here on 12 Mar and closed 1 Jun. Next year\'s call often follows the same rhythm.',
    });
  });

  it('names the year when the previous edition is older than last year', () => {
    expect(previousEditionHint({ editionYear: 2028, previousEditions: [edition] }, NOW)?.text).toBe('The 2026 CFP opened around 12 Mar');
  });

  it('falls back to the deadline when the edition was only stored after it closed', () => {
    const late = { ...edition, firstSeenAt: '2026-07-01T00:00:00Z' };
    expect(previousEditionHint({ editionYear: 2027, previousEditions: [late] }, NOW)?.text).toBe("Last year's CFP closed 1 Jun");
  });

  it('uses the current year when the row has no edition year', () => {
    expect(previousEditionHint({ editionYear: null, previousEditions: [{ ...edition, year: 2025 }] }, NOW)?.text).toBe(
      "Last year's CFP opened around 12 Mar"
    );
    expect(previousEditionHint({ editionYear: null, previousEditions: [{ ...edition, year: 2024 }] }, NOW)?.text).toBe(
      'The 2024 CFP opened around 12 Mar'
    );
  });

  it('returns null without previous editions', () => {
    expect(previousEditionHint({ editionYear: 2027, previousEditions: [] }, NOW)).toBeNull();
    expect(previousEditionHint({ editionYear: 2027 }, NOW)).toBeNull();
  });
});
