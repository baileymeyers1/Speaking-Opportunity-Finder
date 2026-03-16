import { describe, it, expect } from 'vitest';
import { parseEnrichmentResponse } from './enrichmentService.js';

describe('parseEnrichmentResponse', () => {
  it('parses valid JSON response with all fields', () => {
    const input = JSON.stringify({
      cfpDeadline: '2026-06-01',
      eventDate: '2026-09-15',
      industries: ['Technology', 'AI'],
      location: 'San Francisco, CA',
      compensationType: 'paid',
      compensationAmount: 500,
      isRemote: false,
    });

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.cfpDeadline).toBeInstanceOf(Date);
    expect(result.cfpDeadline!.toISOString()).toContain('2026-06-01');
    expect(result.eventDate).toBeInstanceOf(Date);
    expect(result.eventDate!.toISOString()).toContain('2026-09-15');
    expect(result.industries).toEqual(['Technology', 'AI']);
    expect(result.location).toBe('San Francisco, CA');
    expect(result.compensationType).toBe('paid');
    expect(result.compensationAmount).toBe(500);
    expect(result.isRemote).toBe(false);
  });

  it('handles markdown-wrapped JSON', () => {
    const input = '```json\n{"cfpDeadline": "2026-06-01", "industries": ["Technology"]}\n```';

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.cfpDeadline).toBeInstanceOf(Date);
    expect(result.cfpDeadline!.toISOString()).toContain('2026-06-01');
    expect(result.industries).toEqual(['Technology']);
  });

  it('handles JSON with surrounding text', () => {
    const input = 'Here is the result: {"cfpDeadline": "2026-06-01", "location": "Remote"} hope this helps!';

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.cfpDeadline).toBeInstanceOf(Date);
    expect(result.location).toBe('Remote');
  });

  it('validates dates in 1900-2100 range and rejects year 3000', () => {
    const input = JSON.stringify({
      cfpDeadline: '3000-01-01',
      eventDate: '2026-09-15',
    });

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.cfpDeadline).toBeUndefined();
    expect(result.eventDate).toBeInstanceOf(Date);
  });

  it('validates dates in 1900-2100 range and rejects year 1800', () => {
    const input = JSON.stringify({
      cfpDeadline: '1800-01-01',
    });

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.cfpDeadline).toBeUndefined();
  });

  it('returns failed for unparseable response', () => {
    const input = 'This is not JSON at all';

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('failed');
    expect(result.enrichmentError).toBe('No JSON found in response');
  });

  it('returns failed for empty string', () => {
    const result = parseEnrichmentResponse('');

    expect(result.enrichmentStatus).toBe('failed');
    expect(result.enrichmentError).toBe('No JSON found in response');
  });

  it('treats "null" string as undefined for dates', () => {
    const input = JSON.stringify({
      cfpDeadline: 'null',
      eventDate: null,
    });

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.cfpDeadline).toBeUndefined();
    expect(result.eventDate).toBeUndefined();
  });

  it('treats "null" string as undefined for location', () => {
    const input = JSON.stringify({
      location: 'null',
    });

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.location).toBeUndefined();
  });

  it('treats "null" string as undefined for compensationType', () => {
    const input = JSON.stringify({
      compensationType: 'null',
    });

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.compensationType).toBeUndefined();
  });

  it('handles non-array industries gracefully', () => {
    const input = JSON.stringify({
      industries: 'Technology',
    });

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.industries).toBeUndefined();
  });

  it('handles isRemote boolean correctly', () => {
    const input = JSON.stringify({ isRemote: true });

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('enriched');
    expect(result.isRemote).toBe(true);
  });

  it('returns failed for malformed JSON', () => {
    const input = '{"cfpDeadline": "2026-06-01"';

    const result = parseEnrichmentResponse(input);

    expect(result.enrichmentStatus).toBe('failed');
    expect(result.enrichmentError).toBeDefined();
  });
});
