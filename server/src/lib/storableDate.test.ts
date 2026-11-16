import { describe, expect, it } from 'vitest';
import { storableDate } from './storableDate.js';

describe('storableDate', () => {
  it('keeps a real date inside the range', () => {
    const date = new Date('2027-05-04T00:00:00Z');
    expect(storableDate(date)).toBe(date);
    expect(storableDate(new Date('1900-01-01T00:00:00Z'))).not.toBeNull();
    expect(storableDate(new Date('2100-12-31T23:59:59Z'))).not.toBeNull();
  });

  it('drops an Invalid Date, such as a stored year past 9999 read back', () => {
    expect(storableDate(new Date('Invalid Date'))).toBeNull();
  });

  it('drops years Postgres would store but the app cannot use', () => {
    expect(storableDate(new Date('+020261-05-04T00:00:00Z'))).toBeNull();
    expect(storableDate(new Date('2101-01-01T00:00:00Z'))).toBeNull();
    expect(storableDate(new Date('1899-12-31T23:59:59Z'))).toBeNull();
  });

  it('maps absent values to null', () => {
    expect(storableDate(null)).toBeNull();
    expect(storableDate(undefined)).toBeNull();
  });
});
