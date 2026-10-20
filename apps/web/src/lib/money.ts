// The API works only in integer paise. These helpers convert at the UI boundary,
// using string handling instead of floating-point maths (e.g. "19.99" → 1999, never 1998.9999).

const formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

/** 123456 → "₹1,234.56" */
export function formatPaise(paise: number): string {
  return formatter.format(paise / 100);
}

/** Parses user input like "250", "250.5" or "1,250.75" into paise. Returns null if invalid. */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.trim().replace(/[,₹\s]/g, '');
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = Number(match[1]);
  const paise = Number((match[2] ?? '').padEnd(2, '0'));
  const total = rupees * 100 + paise;
  return total > 0 ? total : null;
}
