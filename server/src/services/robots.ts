import { fetchWithTimeout } from '../scrapers/lib/html.js';

/**
 * robots.txt for pages the app reaches by following links (followedLinks.ts):
 * those are pages it found on its own, so it reads only what a site allows
 * every crawler (`User-agent: *`). Rules for a named crawler (ClaudeBot,
 * GPTBot, …) name somebody else.
 *
 * RFC 9309: the longest matching rule wins and Allow wins a tie; `*` matches
 * any run of characters and a final `$` the end of the path. A robots.txt that
 * is missing (4xx) allows everything; one that cannot be fetched (5xx,
 * network) allows nothing for now, and the read is tried again later.
 */

interface Rule {
  allow: boolean;
  pattern: string;
  regex: RegExp;
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** The rules every crawler is held to: the `User-agent: *` groups, merged. */
export function rulesForEveryone(robotsTxt: string): Rule[] {
  const rules: Rule[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      // A user-agent line after rules starts a new group.
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      inRules = true;
      if (!agents.includes('*') || value === '') continue;
      rules.push({ allow: key === 'allow', pattern: value, regex: toRegex(value) });
    }
  }
  return rules;
}

/** Whether the rules let a crawler read this path (with its query). */
export function isAllowed(rules: readonly Rule[], pathWithQuery: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (!rule.regex.test(pathWithQuery)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { rules: Rule[] | 'nothing'; at: number }>();

export interface RobotsDeps {
  fetchRobots: (origin: string) => Promise<{ status: number; text: string } | null>;
  now: () => number;
}

const defaultDeps: RobotsDeps = {
  fetchRobots: async (origin) => {
    try {
      const response = await fetchWithTimeout(`${origin}/robots.txt`, { timeoutMs: 5000 });
      return { status: response.status, text: response.ok ? await response.text() : '' };
    } catch {
      return null;
    }
  },
  now: () => Date.now(),
};

/** Whether the site lets every crawler read this page; cached per site for an hour. */
export async function robotsAllows(url: string, deps: RobotsDeps = defaultDeps): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const cached = cache.get(parsed.origin);
  let rules = cached && deps.now() - cached.at < CACHE_MS ? cached.rules : undefined;
  if (rules === undefined) {
    const response = await deps.fetchRobots(parsed.origin);
    if (!response || response.status >= 500) rules = 'nothing';
    else rules = response.status >= 400 ? [] : rulesForEveryone(response.text);
    cache.set(parsed.origin, { rules, at: deps.now() });
  }
  return rules !== 'nothing' && isAllowed(rules, `${parsed.pathname}${parsed.search}`);
}

/** For tests: forget what was fetched. */
export function clearRobotsCache(): void {
  cache.clear();
}
