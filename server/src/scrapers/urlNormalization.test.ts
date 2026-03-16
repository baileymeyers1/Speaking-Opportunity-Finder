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

  it('strips all query parameters', () => {
    expect(normalizeUrl('https://example.com/page?ref=bar&utm_medium=email')).toBe('https://example.com/page');
  });

  it('lowercases the URL', () => {
    expect(normalizeUrl('https://Example.COM/Page')).toBe('https://example.com/page');
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

  it('handles invalid URLs gracefully by lowercasing and stripping trailing slash', () => {
    expect(normalizeUrl('not-a-valid-url/')).toBe('not-a-valid-url');
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
