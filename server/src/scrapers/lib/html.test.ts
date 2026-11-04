import { describe, it, expect } from 'vitest';
import { htmlToLines, monthIndex, parseHumanDate, stripTags } from './html.js';

describe('htmlToLines', () => {
  it('keeps one line per block element and drops scripts and empty lines', () => {
    const html = `<html><head><style>p { color: red }</style><script>var a = "<p>x</p>";</script></head>
      <body><h1>June   2026</h1><table><tr><td>4th</td><td><a href="x">Food &amp; Health</a>
      Summit</td></tr></table><p></p><div>Last<br>line</div><!-- <p>hidden</p> --></body></html>`;
    expect(htmlToLines(html)).toEqual(['June 2026', '4th', 'Food & Health Summit', 'Last', 'line']);
  });
});

describe('stripTags', () => {
  it('removes tags, decodes entities and collapses whitespace', () => {
    expect(stripTags('<b>R&amp;D</b>\n  <i>Summit</i>')).toBe('R&D Summit');
  });
});

describe('parseHumanDate', () => {
  it.each([
    ['10th November 2026', '2026-11-10'],
    ['Nov 13, 2026', '2026-11-13'],
    ['September 3 2027', '2027-09-03'],
    ['2026-11-13T00:00:00', '2026-11-13'],
    ['Deadline: 11/13/2026', '2026-11-13'],
  ])('parses %s', (input, expected) => {
    expect(parseHumanDate(input)?.toISOString().slice(0, 10)).toBe(expected);
  });

  it('rejects impossible or missing dates', () => {
    expect(parseHumanDate('31st February 2027')).toBeUndefined();
    expect(parseHumanDate('November 30, -0001')).toBeUndefined();
    expect(parseHumanDate('TBA')).toBeUndefined();
  });

  it('does not treat words that merely start like a month as months', () => {
    expect(monthIndex('Marketing')).toBeUndefined();
    expect(monthIndex('Sept')).toBe(8);
  });
});
