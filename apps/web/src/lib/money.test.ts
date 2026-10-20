import { describe, expect, it } from 'vitest';
import { formatPaise, parseRupeesToPaise } from './money';

describe('parseRupeesToPaise', () => {
  it.each([
    ['250', 25_000],
    ['250.5', 25_050],
    ['19.99', 1_999],
    ['0.01', 1],
    ['1,250.75', 125_075],
    [' ₹ 99 ', 9_900],
  ])('parses %j as %i paise', (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '0', '0.00', '-5', '1.234', '1e3', '12.'])('rejects %j', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull();
  });
});

describe('formatPaise', () => {
  it('formats paise as Indian rupees', () => {
    expect(formatPaise(123_456)).toBe('₹1,234.56');
    expect(formatPaise(-5_000)).toBe('-₹50.00');
  });
});
