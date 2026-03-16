import { describe, it, expect } from 'vitest';
import { generateDeduplicationKey } from './deduplicationService.js';

describe('deduplicationService', () => {
  it('generates same key for similar titles', () => {
    const key1 = generateDeduplicationKey('Tech Summit 2026', 'IEEE');
    const key2 = generateDeduplicationKey('IEEE Tech Summit 2026', 'IEEE');
    expect(key1).toBe(key2);
  });

  it('normalizes whitespace and case', () => {
    const key1 = generateDeduplicationKey('  React Conf  ', 'Meta');
    const key2 = generateDeduplicationKey('react conf', 'Meta');
    expect(key1).toBe(key2);
  });

  it('different events get different keys', () => {
    const key1 = generateDeduplicationKey('React Conf', 'Meta');
    const key2 = generateDeduplicationKey('Vue Summit', 'Evan You');
    expect(key1).not.toBe(key2);
  });

  it('strips years from titles', () => {
    const key1 = generateDeduplicationKey('DevCon 2025', 'Acme');
    const key2 = generateDeduplicationKey('DevCon 2026', 'Acme');
    expect(key1).toBe(key2);
  });

  it('handles missing organization', () => {
    const key1 = generateDeduplicationKey('React Conf', '');
    const key2 = generateDeduplicationKey('React Conf', '');
    expect(key1).toBe(key2);
  });
});
