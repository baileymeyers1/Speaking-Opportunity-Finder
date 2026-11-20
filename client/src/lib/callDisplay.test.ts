import { describe, expect, it } from 'vitest';
import { organizationLabel, payLabel, plainDescription, whereLabel } from './callDisplay';

describe('organizationLabel', () => {
  it('is the organization, unless it only repeats the title', () => {
    expect(organizationLabel({ organization: 'Colorado Rural Health Center', title: '2027 Rural Healthcare Conference' })).toBe(
      'Colorado Rural Health Center'
    );
    expect(organizationLabel({ organization: ' NET Conf Online 2026 ', title: 'NET Conf Online 2026' })).toBeNull();
    expect(organizationLabel({ organization: '', title: 'NET Conf Online 2026' })).toBeNull();
  });
});

describe('whereLabel', () => {
  it('says where, and whether remote is an option', () => {
    expect(whereLabel({ location: 'Englewood, CO', isRemote: false })).toBe('Englewood, CO');
    expect(whereLabel({ location: 'Turin, Italy', isRemote: true })).toBe('Turin, Italy, or remote');
    expect(whereLabel({ location: null, isRemote: true })).toBe('Remote');
    expect(whereLabel({ location: null, isRemote: false })).toBeNull();
  });
});

describe('payLabel', () => {
  it('names the kind of pay and the amount when there is one', () => {
    expect(payLabel({ compensationType: 'paid', compensationAmount: 1500 })).toBe('paid, $1,500');
    expect(payLabel({ compensationType: 'travel', compensationAmount: null })).toBe('travel');
    expect(payLabel({ compensationType: null, compensationAmount: null })).toBeNull();
  });
});

describe('plainDescription', () => {
  it('drops Markdown heading marks and bold marks, keeping the words and the line breaks', () => {
    expect(plainDescription('# AI for PR Conference 2027\n9:00am to 5:00pm\n## Why **attend**')).toBe(
      'AI for PR Conference 2027\n9:00am to 5:00pm\nWhy attend'
    );
  });

  it('leaves a number sign inside a line alone', () => {
    expect(plainDescription('Track #2 covers C# and F#')).toBe('Track #2 covers C# and F#');
  });

  it('closes up runs of blank lines', () => {
    expect(plainDescription('One\n\n\n\nTwo\n')).toBe('One\n\nTwo');
  });
});
