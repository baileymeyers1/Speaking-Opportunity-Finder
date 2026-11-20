import { describe, expect, it } from 'vitest';
import {
  EVERYONE,
  NOBODY,
  fitSummary,
  hasChoice,
  namedFits,
  resolveForWhom,
  savedFor,
  savedForLabel,
  savedSummary,
  saveTarget,
  speakerParam,
  speakersByFit,
} from './forWhom';

const dana = { id: 'dana', name: 'Dana Okafor' };
const marcus = { id: 'marcus', name: 'Marcus Lee' };
const priya = { id: 'priya', name: '' };

describe('hasChoice', () => {
  it('needs more than one speaker', () => {
    expect(hasChoice([])).toBe(false);
    expect(hasChoice([dana])).toBe(false);
    expect(hasChoice([dana, marcus])).toBe(true);
  });
});

describe('resolveForWhom', () => {
  it('is everyone until something was chosen, and on a roster with no choice', () => {
    expect(resolveForWhom(null, [dana, marcus])).toBe(EVERYONE);
    expect(resolveForWhom('dana', [dana])).toBe(EVERYONE);
    expect(resolveForWhom(NOBODY, [], { allowNobody: true })).toBe(EVERYONE);
  });

  it('keeps a speaker who is on the roster and forgets one who is not', () => {
    expect(resolveForWhom('marcus', [dana, marcus])).toBe('marcus');
    expect(resolveForWhom('removed', [dana, marcus])).toBe(EVERYONE);
  });

  it('keeps nobody only where there is such a list', () => {
    expect(resolveForWhom(NOBODY, [dana, marcus], { allowNobody: true })).toBe(NOBODY);
    expect(resolveForWhom(NOBODY, [dana, marcus])).toBe(EVERYONE);
  });
});

describe('speakerParam', () => {
  it('is a speaker id, or nothing for everyone and nobody', () => {
    expect(speakerParam('dana')).toBe('dana');
    expect(speakerParam(EVERYONE)).toBeUndefined();
    expect(speakerParam(NOBODY)).toBeUndefined();
  });
});

describe('saveTarget', () => {
  it('saves for nobody on an empty roster, and for the only speaker on a roster of one', () => {
    expect(saveTarget(EVERYONE, [])).toEqual({ speakerId: null });
    expect(saveTarget(EVERYONE, [dana])).toEqual({ speakerId: 'dana' });
  });

  it('saves for the chosen speaker, and asks when everyone is chosen', () => {
    expect(saveTarget('marcus', [dana, marcus])).toEqual({ speakerId: 'marcus' });
    expect(saveTarget(EVERYONE, [dana, marcus])).toBe('ask');
    expect(saveTarget(NOBODY, [dana, marcus])).toBe('ask');
  });
});

describe('savedFor', () => {
  const items = [
    { id: 'a', speakerId: 'dana' },
    { id: 'b', speakerId: null },
    { id: 'c', speakerId: 'marcus' },
  ];

  it("lists everyone's, one speaker's, or the calls saved for nobody", () => {
    expect(savedFor(items, EVERYONE).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(savedFor(items, 'dana').map((item) => item.id)).toEqual(['a']);
    expect(savedFor(items, NOBODY).map((item) => item.id)).toEqual(['b']);
  });
});

describe('savedForLabel', () => {
  it('names the speaker, or says nobody has it yet', () => {
    expect(savedForLabel('dana', [dana, marcus])).toBe('Dana Okafor');
    expect(savedForLabel('priya', [priya])).toBe('Unnamed speaker');
    expect(savedForLabel(null, [dana])).toBe('No one yet');
  });
});

describe('namedFits', () => {
  it('puts the roster names on the fits and keeps the ranking', () => {
    expect(
      namedFits(
        [
          { speakerId: 'marcus', score: 74 },
          { speakerId: 'dana', score: 38 },
          { speakerId: 'gone', score: 20 },
        ],
        [dana, marcus]
      )
    ).toEqual([
      { speakerId: 'marcus', score: 74, name: 'Marcus Lee' },
      { speakerId: 'dana', score: 38, name: 'Dana Okafor' },
    ]);
    expect(namedFits(undefined, [dana])).toEqual([]);
  });
});

describe('fitSummary', () => {
  it('gives the first two reasons a speaker fits', () => {
    expect(fitSummary({ reasons: ['matches: digital health', 'travel covered', 'conference format'], misses: ['deadline in 2 days'] })).toBe(
      'matches: digital health; travel covered'
    );
  });

  it('falls back to the first thing that does not fit', () => {
    expect(fitSummary({ reasons: [], misses: ['in-person in Berlin, prefers remote', 'unpaid, needs a paid slot'] })).toBe(
      'in-person in Berlin, prefers remote'
    );
  });

  it('is empty while the reasons have not arrived, or there are none', () => {
    expect(fitSummary({})).toBe('');
    expect(fitSummary({ reasons: [], misses: [] })).toBe('');
  });
});

describe('speakersByFit', () => {
  it('lists the best fit first and unscored speakers last, in roster order', () => {
    const order = speakersByFit(
      [dana, marcus, priya],
      [
        { speakerId: 'marcus', score: 74 },
        { speakerId: 'dana', score: 38 },
      ]
    );
    expect(order.map((entry) => [entry.speaker.id, entry.score])).toEqual([
      ['marcus', 74],
      ['dana', 38],
      ['priya', null],
    ]);
  });

  it('keeps roster order without fits', () => {
    expect(speakersByFit([dana, marcus], undefined).map((entry) => entry.speaker.id)).toEqual(['dana', 'marcus']);
  });
});

describe('savedSummary', () => {
  const items = [
    { category: 'interested' as const, speakerId: 'dana' },
    { category: 'interested' as const, speakerId: 'dana' },
    { category: 'accepted' as const, speakerId: 'dana' },
    { category: 'applied' as const, speakerId: 'marcus' },
    { category: 'applied' as const, speakerId: null },
  ];

  it('counts one speaker stage by stage and skips empty stages', () => {
    expect(savedSummary(items, 'dana')).toBe('2 interested, 1 accepted');
    expect(savedSummary(items, 'marcus')).toBe('1 applied');
  });

  it('says so when nothing is saved for them', () => {
    expect(savedSummary(items, 'priya')).toBe('Nothing saved');
  });
});
