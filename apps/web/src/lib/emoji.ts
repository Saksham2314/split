// Emojis are derived, never stored: the same description, group name or user id always maps
// to the same emoji, so the UI stays consistent across devices without any schema change.

// Ordered: the first matching rule wins, so specific words ("scooter") come before generic ones ("rent").
const EXPENSE_RULES: [RegExp, string][] = [
  [/coffee|chai|\btea\b|cafe|starbucks/, '☕'],
  [/beer|\bbar\b|pub|wine|drinks?|cocktail/, '🍻'],
  [/pizza/, '🍕'],
  [/ice ?cream|dessert|cake/, '🍰'],
  [/snack|popcorn|chips/, '🍿'],
  [/dinner|lunch|breakfast|brunch|food|restaurant|meal|biryani|burger|dosa|thali|zomato|swiggy/, '🍽️'],
  [/grocer|vegetable|fruit|supermarket|blinkit|zepto|bigbasket/, '🛒'],
  [/scooter|bike|activa/, '🛵'],
  [/taxi|\bcab\b|uber|\bola\b|auto|rickshaw/, '🚕'],
  [/fuel|petrol|diesel|\bgas\b|toll/, '⛽'],
  [/flight|plane|airport|airline/, '✈️'],
  [/train|metro|railway/, '🚆'],
  [/\bbus\b/, '🚌'],
  [/hotel|hostel|airbnb|\bstay\b|resort/, '🏨'],
  [/movie|cinema|netflix|film/, '🎬'],
  [/concert|ticket|show|event/, '🎟️'],
  [/electric|power|light bill/, '💡'],
  [/wifi|internet|broadband/, '📶'],
  [/rent|house|flat/, '🏠'],
  [/gift|present/, '🎁'],
  [/party|birthday|celebrat/, '🎉'],
  [/shop|clothes|shoes|mall|amazon|flipkart/, '🛍️'],
  [/medic|pharma|doctor|hospital/, '💊'],
  [/gym|sport|cricket|football|game/, '🏏'],
  [/beach|boat|cruise|scuba|surf/, '🏖️'],
];

/** "Dinner at Thalassa" → 🍽️, "Scooter rent" → 🛵, anything unrecognised → 🧾 */
export function expenseEmoji(description: string): string {
  const text = description.toLowerCase();
  return EXPENSE_RULES.find(([re]) => re.test(text))?.[1] ?? '🧾';
}

const GROUP_RULES: [RegExp, string][] = [
  [/goa|beach|island|bali|maldives/, '🏝️'],
  [/trip|travel|vacation|holiday|tour|road/, '🧳'],
  [/trek|hike|mountain|manali|himalaya|ladakh/, '🏔️'],
  [/flat|home|house|roomies|roommates|pg\b/, '🏠'],
  [/office|work|team|colleagues/, '💼'],
  [/dinner|food|lunch|foodies/, '🍜'],
  [/party|birthday|bday/, '🥳'],
  [/wedding|shaadi/, '💍'],
  [/college|hostel|class|uni/, '🎓'],
  [/family|fam\b/, '👨‍👩‍👧'],
];
const GROUP_FALLBACK = ['✨', '🚀', '🌈', '🎈', '🪩', '🌻', '🍀', '🔥'];

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

export function groupEmoji(name: string): string {
  const text = name.toLowerCase();
  return GROUP_RULES.find(([re]) => re.test(text))?.[1] ?? GROUP_FALLBACK[hash(text) % GROUP_FALLBACK.length]!;
}

const AVATARS = ['🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦄', '🐙', '🐝', '🦉', '🐳', '🦋', '🐰', '🐻'];
const AVATAR_GRADIENTS = [
  'from-rose-400 to-orange-300',
  'from-amber-300 to-lime-300',
  'from-emerald-400 to-teal-300',
  'from-cyan-400 to-sky-300',
  'from-indigo-400 to-violet-300',
  'from-fuchsia-400 to-pink-300',
];

/** A stable animal + background colour per user, so people are recognisable at a glance. */
export function avatarFor(userId: number): { emoji: string; gradient: string } {
  return {
    emoji: AVATARS[userId % AVATARS.length]!,
    gradient: AVATAR_GRADIENTS[Math.floor(userId / AVATARS.length + userId) % AVATAR_GRADIENTS.length]!,
  };
}
