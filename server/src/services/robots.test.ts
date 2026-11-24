import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearRobotsCache, isAllowed, robotsAllows, rulesForEveryone } from './robots.js';

describe('rulesForEveryone', () => {
  it('reads only the groups for every crawler, several user-agent lines to a group', () => {
    const rules = rulesForEveryone(`
User-agent: ClaudeBot
User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /admin/   # staff only
Allow: /admin/public
Crawl-delay: 10
`);
    expect(isAllowed(rules, '/events')).toBe(true);
    expect(isAllowed(rules, '/admin/settings')).toBe(false);
    expect(isAllowed(rules, '/admin/public/calendar')).toBe(true);
  });

  it('merges two groups for every crawler and lets the longest rule win, Allow on a tie', () => {
    const rules = rulesForEveryone('User-agent: *\nDisallow: /cfp\n\nUser-agent: *\nAllow: /cfp/open\nDisallow: /a\nAllow: /a');
    expect(isAllowed(rules, '/cfp/closed')).toBe(false);
    expect(isAllowed(rules, '/cfp/open-calls')).toBe(true);
    expect(isAllowed(rules, '/a')).toBe(true);
  });

  it('understands * and $ in patterns, and an empty Disallow as no rule', () => {
    const rules = rulesForEveryone('User-agent: *\nDisallow: /*?_rsc=\nDisallow: /*.pdf$\nDisallow:');
    expect(isAllowed(rules, '/events?_rsc=abc')).toBe(false);
    expect(isAllowed(rules, '/files/cfp.pdf')).toBe(false);
    expect(isAllowed(rules, '/files/cfp.pdf?download=1')).toBe(true);
    expect(isAllowed(rules, '/events')).toBe(true);
  });

  it('does not read a rule without a leading slash as covering every path', () => {
    // The Trade Show Calendar's robots.txt, 2026-11-24.
    const rules = rulesForEveryone('User-agent: *\nDisallow: index.php\nDisallow: /6141/');
    expect(isAllowed(rules, '/tsnn/index.php')).toBe(true);
    expect(isAllowed(rules, '/6141/x')).toBe(false);
  });
});

describe('robotsAllows', () => {
  beforeEach(() => clearRobotsCache());

  const deps = (response: { status: number; text: string } | null) => ({ fetchRobots: vi.fn(async () => response), now: () => 0 });

  it('reads a page the rules allow, and caches the rules per site', async () => {
    const fake = deps({ status: 200, text: 'User-agent: *\nDisallow: /private' });
    expect(await robotsAllows('https://events.example/2027/speak', fake)).toBe(true);
    expect(await robotsAllows('https://events.example/private/x', fake)).toBe(false);
    expect(fake.fetchRobots).toHaveBeenCalledTimes(1);
  });

  it('allows everything when there is no robots.txt, and nothing while it cannot be fetched', async () => {
    expect(await robotsAllows('https://no-robots.example/x', deps({ status: 404, text: '' }))).toBe(true);
    expect(await robotsAllows('https://down.example/x', deps({ status: 503, text: '' }))).toBe(false);
    expect(await robotsAllows('https://unreachable.example/x', deps(null))).toBe(false);
  });
});
