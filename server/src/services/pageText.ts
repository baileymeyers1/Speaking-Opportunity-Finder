import { fetchWithTimeout, stripTags } from '../scrapers/lib/html.js';

/**
 * Fetch the visible text of an opportunity's page for Claude extraction.
 * Shared by live search and the enrichment / verification worker.
 */

export const DEFAULT_PAGE_TIMEOUT_MS = 8000;
export const DEFAULT_PAGE_MAX_CHARS = 5000;

export type PageFetchFailure = 'gone' | 'http_error' | 'not_text' | 'timeout' | 'network';

export type PageFetchResult =
  | { ok: true; text: string; status: number }
  | { ok: false; reason: PageFetchFailure; status?: number; message: string };

/** Navigation, header and footer blocks are boilerplate; drop them before stripping tags. */
export function visibleText(html: string, maxChars: number = DEFAULT_PAGE_MAX_CHARS): string {
  const withoutChrome = html.replace(/<(nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  return stripTags(withoutChrome).slice(0, maxChars);
}

export async function fetchPageText(
  url: string,
  { timeoutMs = DEFAULT_PAGE_TIMEOUT_MS, maxChars = DEFAULT_PAGE_MAX_CHARS }: { timeoutMs?: number; maxChars?: number } = {}
): Promise<PageFetchResult> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      timeoutMs,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: isAbort ? 'timeout' : 'network',
      message: isAbort ? `Timed out after ${timeoutMs}ms` : error instanceof Error ? error.message : 'Network error',
    };
  }

  if (response.status === 404 || response.status === 410) {
    return { ok: false, reason: 'gone', status: response.status, message: `HTTP ${response.status}` };
  }
  if (!response.ok) {
    return { ok: false, reason: 'http_error', status: response.status, message: `HTTP ${response.status}` };
  }

  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|text\/plain|application\/xhtml\+xml/.test(contentType)) {
    return { ok: false, reason: 'not_text', status: response.status, message: `Unsupported content-type: ${contentType || 'unknown'}` };
  }

  try {
    const html = await response.text();
    return { ok: true, text: visibleText(html, maxChars), status: response.status };
  } catch (error) {
    return { ok: false, reason: 'network', status: response.status, message: error instanceof Error ? error.message : 'Read error' };
  }
}
