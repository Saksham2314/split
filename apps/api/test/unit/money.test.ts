import { describe, expect, it } from 'vitest';
import { simplifyDebts, splitEqually, type Balance } from '../../src/lib/money.js';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('splitEqually', () => {
  it('splits evenly when the amount divides exactly', () => {
    expect(splitEqually(900, [1, 2, 3])).toEqual([
      { userId: 1, sharePaise: 300 },
      { userId: 2, sharePaise: 300 },
      { userId: 3, sharePaise: 300 },
    ]);
  });

  it('gives leftover paise to the lowest user ids so shares sum to the total', () => {
    const shares = splitEqually(1000, [3, 1, 2]);
    expect(shares).toEqual([
      { userId: 1, sharePaise: 334 },
      { userId: 2, sharePaise: 333 },
      { userId: 3, sharePaise: 333 },
    ]);
    expect(sum(shares.map((s) => s.sharePaise))).toBe(1000);
  });

  it('always sums exactly to the total for many amounts and group sizes', () => {
    for (let people = 1; people <= 12; people++) {
      const ids = Array.from({ length: people }, (_, i) => i + 1);
      for (const amount of [1, 7, 99, 100, 1001, 33_333, 999_999_999]) {
        const shares = splitEqually(amount, ids);
        expect(sum(shares.map((s) => s.sharePaise))).toBe(amount);
        const values = shares.map((s) => s.sharePaise);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('ignores duplicate participants', () => {
    expect(splitEqually(100, [2, 2, 1])).toHaveLength(2);
  });

  it('rejects invalid input', () => {
    expect(() => splitEqually(0, [1])).toThrow(RangeError);
    expect(() => splitEqually(10.5, [1])).toThrow(RangeError);
    expect(() => splitEqually(100, [])).toThrow(RangeError);
  });
});

describe('simplifyDebts', () => {
  const apply = (balances: Balance[], transfers: ReturnType<typeof simplifyDebts>) => {
    const net = new Map(balances.map((b) => [b.userId, b.netPaise]));
    for (const t of transfers) {
      net.set(t.fromUserId, net.get(t.fromUserId)! + t.amountPaise);
      net.set(t.toUserId, net.get(t.toUserId)! - t.amountPaise);
    }
    return [...net.values()];
  };

  it('returns nothing when everyone is settled', () => {
    expect(simplifyDebts([{ userId: 1, netPaise: 0 }, { userId: 2, netPaise: 0 }])).toEqual([]);
  });

  it('settles a simple two-person debt', () => {
    expect(simplifyDebts([{ userId: 1, netPaise: 500 }, { userId: 2, netPaise: -500 }])).toEqual([
      { fromUserId: 2, toUserId: 1, amountPaise: 500 },
    ]);
  });

  it('settles everyone with at most n - 1 transfers', () => {
    const balances: Balance[] = [
      { userId: 1, netPaise: 6000 },
      { userId: 2, netPaise: -1000 },
      { userId: 3, netPaise: -2000 },
      { userId: 4, netPaise: -3000 },
      { userId: 5, netPaise: 0 },
    ];
    const transfers = simplifyDebts(balances);
    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
    expect(apply(balances, transfers).every((n) => n === 0)).toBe(true);
    expect(transfers.every((t) => t.amountPaise > 0)).toBe(true);
  });

  it('rejects balances that do not sum to zero', () => {
    expect(() => simplifyDebts([{ userId: 1, netPaise: 5 }])).toThrow();
  });
});
