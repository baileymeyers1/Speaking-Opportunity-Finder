import { stripTags } from '../scrapers/lib/html.js';
import { decodeHtmlEntities } from './dataNormalization.js';

/**
 * The links on a page, for the extraction to choose from: an event's own call
 * for speakers is often one click away ("Speak", "Call for Papers" in the
 * menu), a listing names the event's own site, and a calendar lists many
 * events. The extraction may only answer with a URL from this list
 * (extraction.ts), so it cannot invent one.
 *
 * Links come from the whole page, menus included: `visibleText` drops
 * navigation, header and footer, which is where the call link usually is.
 */

export interface PageLink {
  text: string;
  url: string;
}

/** Enough for a calendar page's events, small enough to add about 1,500 tokens to a call. */
export const MAX_PAGE_LINKS = 60;
const MAX_LINK_TEXT = 100;

/** Wording of a link to a call for speakers, in its words or its address. */
const CALL_TEXT = /\b(call for|cfp|speak|speakers?|submit|submissions?|proposals?|abstracts?|present(er|ers|ation|ations)?|papers)\b/i;
const CALL_PATH = /(cfp|call-?for|speak|submi|proposal|abstract|present)/i;

/** Hosts whose pages are posts and profiles, never an event's own page. */
const SOCIAL_HOSTS = [
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'youtu.be',
  'tiktok.com', 'pinterest.com', 'threads.net', 'wa.me', 't.me', 'flickr.com', 'vimeo.com',
];

const ASSET_PATH = /\.(css|js|mjs|json|xml|rss|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|zip|mp4|mp3|mov|avi)$/i;
const CHORE_PATH = /\/(log-?in|sign-?in|sign-?up|log-?out|my-?account|account|cart|checkout|privacy|terms|cookies?|gdpr|imprint|impressum|careers|jobs|donate|newsletter|subscribe|unsubscribe|wp-admin|wp-login|feed)(\/|$|\.|-)/i;
const CHORE_TEXT = /^(sign in|log ?in|log out|sign up|privacy( policy)?|terms( of (use|service))?|terms (&|and) conditions|cookies?( policy| settings)?|cart|checkout|my account|subscribe|newsletter|donate|careers|jobs|skip to (main )?content|back to top|menu|search)$/i;

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!match) return null;
  return decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '').trim();
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, '').toLowerCase();
}

/** The address without its fragment or a trailing slash, so one page is one link. */
function normalize(href: string, base: string): URL | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

/** A URL in the form the link list uses, or null; for comparing an address the model gave with the list. */
export function normalizeLinkUrl(href: string, base?: string): string | null {
  return normalize(href, base ?? href)?.href ?? null;
}

function isChore(url: URL, text: string): boolean {
  const host = hostOf(url);
  if (SOCIAL_HOSTS.some((social) => host === social || host.endsWith(`.${social}`))) return true;
  if (ASSET_PATH.test(url.pathname)) return true;
  return CHORE_PATH.test(url.pathname) || CHORE_TEXT.test(text);
}

function isCallLink(link: PageLink): boolean {
  if (CALL_TEXT.test(link.text)) return true;
  try {
    return CALL_PATH.test(new URL(link.url).pathname);
  } catch {
    return false;
  }
}

/**
 * Each address once, with its most telling words (call wording first, then
 * the longest); calls first, then links to other sites (an event's own site,
 * a calendar's events), then the rest in page order, cut at MAX_PAGE_LINKS.
 */
function rank(candidates: readonly PageLink[], pageUrl: string): PageLink[] {
  const page = normalize(pageUrl, pageUrl);
  const byUrl = new Map<string, PageLink>();
  for (const candidate of candidates) {
    if (page && candidate.url === page.href) continue;
    const kept = byUrl.get(candidate.url);
    const better =
      !kept ||
      (CALL_TEXT.test(candidate.text) && !CALL_TEXT.test(kept.text)) ||
      (CALL_TEXT.test(candidate.text) === CALL_TEXT.test(kept.text) && candidate.text.length > kept.text.length);
    if (better) byUrl.set(candidate.url, candidate);
  }
  const links = [...byUrl.values()];
  const pageHost = page ? hostOf(page) : '';
  const elsewhere = (link: PageLink) => hostOf(new URL(link.url)) !== pageHost;
  const calls = links.filter(isCallLink);
  const external = links.filter((link) => !isCallLink(link) && elsewhere(link));
  const rest = links.filter((link) => !isCallLink(link) && !elsewhere(link));
  return [...calls, ...external, ...rest].slice(0, MAX_PAGE_LINKS);
}

function candidate(href: string, text: string, base: string): PageLink | null {
  const url = normalize(href, base);
  if (!url) return null;
  const words = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LINK_TEXT);
  if (!words || isChore(url, words)) return null;
  return { text: words, url: url.href };
}

/** The links of an HTML page, resolved against the page's address (or its <base>). */
export function linksFromHtml(html: string, pageUrl: string): PageLink[] {
  const baseTag = /<base\b[^>]*>/i.exec(html);
  const base = (baseTag && attribute(baseTag[0], 'href')) || pageUrl;
  const found: PageLink[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(match[1], 'href');
    if (!href) continue;
    const words = stripTags(match[2]) || attribute(match[1], 'title') || attribute(match[1], 'aria-label') || '';
    const link = candidate(href, words, base);
    if (link) found.push(link);
  }
  return rank(found, pageUrl);
}

/** The links of a page read as Markdown (the page reader's form for what is not HTML). */
export function linksFromMarkdown(markdown: string, pageUrl: string): PageLink[] {
  const found: PageLink[] = [];
  for (const match of markdown.matchAll(/(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const link = candidate(match[2], match[1], pageUrl);
    if (link) found.push(link);
  }
  return rank(found, pageUrl);
}

/** The links as the extraction prompt lists them, one a line. */
export function formatLinksForPrompt(links: readonly PageLink[]): string {
  return links.length > 0 ? links.map((link) => `- ${link.text}: ${link.url}`).join('\n') : '(none)';
}
