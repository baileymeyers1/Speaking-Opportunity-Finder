import { describe, it, expect } from 'vitest';
import { sourceLabel } from './eventHints';

describe('sourceLabel', () => {
  it('maps source ids to readable names and passes unknown ones through', () => {
    expect(sourceLabel('wikicfp.com')).toBe('WikiCFP');
    expect(sourceLabel('pretalx.com')).toBe('Pretalx');
    expect(sourceLabel('civictech.guide')).toBe('Civic Tech Field Guide');
    expect(sourceLabel('some.new.source')).toBe('some.new.source');
  });
});
