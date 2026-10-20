import { describe, expect, it } from 'vitest';
import { avatarFor, expenseEmoji, groupEmoji } from './emoji';

describe('expenseEmoji', () => {
  it.each([
    ['Dinner at Thalassa', '🍽️'],
    ['Scooter rent', '🛵'], // specific beats generic "rent"
    ['Flat rent October', '🏠'],
    ['Uber to airport', '🚕'],
    ['Morning chai', '☕'],
    ['IndiGo flight', '✈️'],
    ['Misc', '🧾'],
  ])('%s → %s', (description, emoji) => {
    expect(expenseEmoji(description)).toBe(emoji);
  });

  it('does not match words inside other words', () => {
    expect(expenseEmoji('Steam game')).not.toBe('☕'); // "steam" contains "tea"
    expect(expenseEmoji('Cabbage')).toBe('🧾'); // "cabbage" contains "cab"
  });
});

describe('groupEmoji', () => {
  it('recognises common group names', () => {
    expect(groupEmoji('Goa trip')).toBe('🏝️');
    expect(groupEmoji('Flatmates')).toBe('🏠');
  });

  it('is stable for unknown names', () => {
    expect(groupEmoji('Zeta squad')).toBe(groupEmoji('Zeta squad'));
  });
});

describe('avatarFor', () => {
  it('is deterministic per user', () => {
    expect(avatarFor(7)).toEqual(avatarFor(7));
    expect(avatarFor(1).emoji).not.toBe(avatarFor(2).emoji);
  });
});
