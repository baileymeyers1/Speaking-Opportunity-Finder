import { describe, it, expect } from 'vitest';
import { normalizeUrl } from './index.js';

describe('normalizeUrl', () => {
  it('strips www prefix', () => {
    expect(normalizeUrl('https://www.example.com/page')).toBe('https://example.com/page');
  });

  it('strips trailing slashes', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
  });

  it('strips tracking parameters (utm_source)', () => {
    expect(normalizeUrl('https://example.com/page?utm_source=foo')).toBe('https://example.com/page');
  });

  it('strips every tracking parameter but keeps the rest', () => {
    expect(normalizeUrl('https://example.com/page?ref=bar&utm_medium=email&fbclid=x&gclid=y')).toBe('https://example.com/page');
    expect(normalizeUrl('https://example.com/page?id=42&utm_medium=email')).toBe('https://example.com/page?id=42');
  });

  it('keeps identifying query parameters so WikiCFP-style URLs stay distinct', () => {
    const a = normalizeUrl('http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=1001&copyownerid=5');
    const b = normalizeUrl('http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=1002&copyownerid=5');
    expect(a).not.toBe(b);
    expect(a).toContain('eventid=1001');
  });

  it('sorts query parameters so order does not create duplicates', () => {
    expect(normalizeUrl('https://example.com/p?b=2&a=1')).toBe(normalizeUrl('https://example.com/p?a=1&b=2'));
  });

  it('drops the hash fragment', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('lowercases the host but preserves path case', () => {
    expect(normalizeUrl('https://Example.COM/Page')).toBe('https://example.com/Page');
  });

  it('handles URLs with both www and trailing slash', () => {
    expect(normalizeUrl('https://www.example.com/page/')).toBe('https://example.com/page');
  });

  it('handles root URL with trailing slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  it('handles URL without trailing slash', () => {
    expect(normalizeUrl('https://example.com/page')).toBe('https://example.com/page');
  });

  it('handles invalid URLs gracefully by trimming and stripping trailing slash', () => {
    expect(normalizeUrl('Not-A-Valid-Url/')).toBe('Not-A-Valid-Url');
  });

  it('handles http protocol', () => {
    expect(normalizeUrl('http://www.example.com/page')).toBe('http://example.com/page');
  });

  it('preserves path segments', () => {
    expect(normalizeUrl('https://example.com/events/2026/cfp')).toBe('https://example.com/events/2026/cfp');
  });

  it('strips port numbers are kept as part of host', () => {
    // URL constructor keeps port in host, so it stays
    expect(normalizeUrl('https://example.com:8080/page')).toBe('https://example.com:8080/page');
  });
});
