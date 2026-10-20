// Money is always handled as an integer number of paise (₹1 = 100 paise).
// Floating point can't represent most decimal fractions exactly (0.1 + 0.2 !== 0.3),
// so integer arithmetic is the only way to guarantee totals add up to the paisa.

/** Largest single amount we accept: ₹1 crore. Keeps every sum far below 2^53. */
export const MAX_AMOUNT_PAISE = 1_000_000_000;

export interface Share {
  userId: number;
  sharePaise: number;
}

/**
 * Splits `amountPaise` equally between participants.
 * Leftover paise (when the amount doesn't divide evenly) go one each to the first
 * participants in ascending user-id order, so the result is deterministic and the
 * shares always sum exactly to the total. E.g. 1000 / 3 → 334, 333, 333.
 */
export function splitEqually(amountPaise: number, participantIds: number[]): Share[] {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new RangeError('amountPaise must be a positive integer');
  }
  const ids = [...new Set(participantIds)].sort((a, b) => a - b);
  if (ids.length === 0) throw new RangeError('at least one participant is required');

  const base = Math.floor(amountPaise / ids.length);
  const remainder = amountPaise % ids.length;
  return ids.map((userId, index) => ({ userId, sharePaise: base + (index < remainder ? 1 : 0) }));
}

export interface Balance {
  userId: number;
  /** Positive: the group owes this person. Negative: this person owes the group. */
  netPaise: number;
}

export interface Transfer {
  fromUserId: number;
  toUserId: number;
  amountPaise: number;
}

/**
 * Turns net balances into a short list of "X pays Y" transfers that settles everyone.
 *
 * Greedy algorithm: repeatedly match the person who owes the most with the person who
 * is owed the most, and transfer the smaller of the two amounts. Each step settles at
 * least one person fully, so there are at most (n - 1) transfers. (Finding the absolute
 * minimum number is NP-hard; greedy is the standard practical choice.)
 */
export function simplifyDebts(balances: Balance[]): Transfer[] {
  const total = balances.reduce((sum, b) => sum + b.netPaise, 0);
  if (total !== 0) throw new Error(`balances must sum to zero, got ${total}`);

  // Ties broken by userId so the output is stable between calls.
  const byAmountThenId = (a: Balance, b: Balance) => b.netPaise - a.netPaise || a.userId - b.userId;
  const creditors = balances.filter((b) => b.netPaise > 0).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.netPaise < 0).map((b) => ({ userId: b.userId, netPaise: -b.netPaise }));

  const transfers: Transfer[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmountThenId);
    debtors.sort(byAmountThenId);
    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.netPaise, debtor.netPaise);

    transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountPaise: amount });
    creditor.netPaise -= amount;
    debtor.netPaise -= amount;
    if (creditor.netPaise === 0) creditors.shift();
    if (debtor.netPaise === 0) debtors.shift();
  }
  return transfers;
}
