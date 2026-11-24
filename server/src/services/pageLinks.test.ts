import { describe, it, expect } from 'vitest';
import { formatLinksForPrompt, linksFromHtml, linksFromMarkdown, MAX_PAGE_LINKS } from './pageLinks.js';

const PAGE = 'https://www.greenpowerforum.org/2027/';

describe('linksFromHtml', () => {
  it('finds the call link in the menu, which the page text leaves out', () => {
    const html = `<html><body>
      <nav><a href="/2027/agenda">Agenda</a> <a href="/2027/call-for-speakers">Call for Speakers</a></nav>
      <main><h1>Green Power Forum 2027</h1><p>March 3-5, Denver.</p></main>
    </body></html>`;
    const links = linksFromHtml(html, PAGE);
    expect(links[0]).toEqual({ text: 'Call for Speakers', url: 'https://www.greenpowerforum.org/2027/call-for-speakers' });
    expect(links).toContainEqual({ text: 'Agenda', url: 'https://www.greenpowerforum.org/2027/agenda' });
  });

  it('resolves relative links against the page and a <base>', () => {
    expect(linksFromHtml('<a href="speak">Apply to speak</a>', PAGE)[0].url).toBe('https://www.greenpowerforum.org/2027/speak');
    expect(linksFromHtml('<base href="https://cfp.example.org/"><a href="submit">Submit a talk</a>', PAGE)[0].url).toBe('https://cfp.example.org/submit');
  });

  it('keeps the words of a link, entities decoded and tags stripped, or its title when it has none', () => {
    const links = linksFromHtml(
      '<a href="/a"><span>Call&nbsp;for &amp; Papers</span></a><a href="/b" title="Speaker application"><img src="x.png"></a>',
      PAGE
    );
    expect(links.map((link) => link.text)).toEqual(['Call for & Papers', 'Speaker application']);
  });

  it('leaves out what is never an event page', () => {
    const html = [
      '<a href="#top">Back to top</a>',
      '<a href="mailto:info@example.org">Email us</a>',
      '<a href="tel:+15550100">Call us</a>',
      '<a href="javascript:void(0)">Menu</a>',
      '<a href="/style.css">Styles</a>',
      '<a href="https://www.linkedin.com/company/gpf">LinkedIn</a>',
      '<a href="https://x.com/gpf">Follow us</a>',
      '<a href="/privacy-policy">Privacy policy</a>',
      '<a href="/login">Sign in</a>',
      '<a href="/cart">Cart</a>',
      '<a href="https://www.greenpowerforum.org/2027/#venue">Venue</a>',
      '<a href="/2027/sponsors">Sponsors</a>',
    ].join(' ');
    expect(linksFromHtml(html, PAGE)).toEqual([{ text: 'Sponsors', url: 'https://www.greenpowerforum.org/2027/sponsors' }]);
  });

  it('keeps a call PDF', () => {
    expect(linksFromHtml('<a href="/files/cfp-2027.pdf">Call for Presentations (PDF)</a>', PAGE)[0].url).toBe(
      'https://www.greenpowerforum.org/files/cfp-2027.pdf'
    );
  });

  it('lists each address once, with the most telling words', () => {
    const links = linksFromHtml('<a href="/cfp">Here</a><a href="/cfp/">Call for papers</a><a href="/cfp#form">Submit</a>', PAGE);
    expect(links).toEqual([{ text: 'Call for papers', url: 'https://www.greenpowerforum.org/cfp' }]);
  });

  it('puts calls first, then other sites, then the rest, and stops at the cap', () => {
    const many = Array.from({ length: 80 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join('');
    const html = `${many}<a href="https://energyweek.example/">Energy Week 2027</a><a href="/submit-a-proposal">Submit a proposal</a>`;
    const links = linksFromHtml(html, PAGE);
    expect(links).toHaveLength(MAX_PAGE_LINKS);
    expect(links[0].text).toBe('Submit a proposal');
    expect(links[1].text).toBe('Energy Week 2027');
    expect(links[2].text).toBe('Page 0');
  });
});

describe('linksFromMarkdown', () => {
  it('reads [words](url) links, images left out', () => {
    const markdown = 'Intro ![logo](/logo.png) [Call for Speakers](https://example.org/cfp) and [Agenda](/agenda).';
    expect(linksFromMarkdown(markdown, 'https://example.org/event')).toEqual([
      { text: 'Call for Speakers', url: 'https://example.org/cfp' },
      { text: 'Agenda', url: 'https://example.org/agenda' },
    ]);
  });
});

describe('formatLinksForPrompt', () => {
  it('writes one link a line, or says there are none', () => {
    expect(formatLinksForPrompt([{ text: 'Call for Speakers', url: 'https://example.org/cfp' }])).toBe('- Call for Speakers: https://example.org/cfp');
    expect(formatLinksForPrompt([])).toBe('(none)');
  });
});
