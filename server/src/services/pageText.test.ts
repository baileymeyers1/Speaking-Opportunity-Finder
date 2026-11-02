import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPageText, visibleText } from './pageText.js';

function htmlResponse(body: string, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'text/html; charset=utf-8' },
  });
}

describe('visibleText', () => {
  it('drops scripts, navigation, header and footer and collapses whitespace', () => {
    const html = `<html><head><title>T</title><script>var x = 1;</script></head>
      <body><header>Site header</header><nav><a href="/">Home</a></nav>
      <main><h1>Call for   Speakers</h1><p>Deadline: &amp; Dec 1</p></main>
      <footer>Copyright</footer></body></html>`;
    const text = visibleText(html);
    expect(text).toContain('Call for Speakers');
    expect(text).toContain('Deadline: & Dec 1');
    expect(text).not.toContain('var x');
    expect(text).not.toContain('Site header');
    expect(text).not.toContain('Home');
    expect(text).not.toContain('Copyright');
  });

  it('caps the text length', () => {
    expect(visibleText(`<p>${'a'.repeat(10_000)}</p>`, 5000)).toHaveLength(5000);
  });
});

describe('fetchPageText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns visible text for an HTML page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('<p>Submit by <b>Dec 1</b></p>')));
    const result = await fetchPageText('https://example.test/cfp');
    expect(result).toEqual({ ok: true, text: 'Submit by Dec 1', status: 200 });
  });

  it('reports 404 and 410 as gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('nope', { status: 404 })));
    expect(await fetchPageText('https://example.test/x')).toMatchObject({ ok: false, reason: 'gone', status: 404 });
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('nope', { status: 410 })));
    expect(await fetchPageText('https://example.test/x')).toMatchObject({ ok: false, reason: 'gone', status: 410 });
  });

  it('reports other HTTP failures without treating them as closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('busy', { status: 503 })));
    expect(await fetchPageText('https://example.test/x')).toMatchObject({ ok: false, reason: 'http_error', status: 503 });
  });

  it('rejects non-text content types', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('%PDF', { contentType: 'application/pdf' })));
    expect(await fetchPageText('https://example.test/x.pdf')).toMatchObject({ ok: false, reason: 'not_text' });
  });

  it('distinguishes timeouts from network errors', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn(async () => { throw abort; }));
    expect(await fetchPageText('https://example.test/slow', { timeoutMs: 10 })).toMatchObject({ ok: false, reason: 'timeout' });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await fetchPageText('https://example.test/down')).toMatchObject({ ok: false, reason: 'network', message: 'fetch failed' });
  });
});
