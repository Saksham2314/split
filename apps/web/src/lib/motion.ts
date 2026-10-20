import type { Transition, Variants } from 'motion/react';

// The app's motion vocabulary. Every animation picks from these few presets, so movement
// feels like one choreography instead of a pile of unrelated effects:
//   snappy: presses, toggles, small things (fast, barely overshoots)
//   smooth: cards, lists, layout changes (a soft settle)
//   bouncy: celebrations and "new thing appeared" moments (a visible overshoot)
// Exits are always quicker than entrances: things arrive with care and leave without fuss.

export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 },
  smooth: { type: 'spring', stiffness: 260, damping: 30 },
  bouncy: { type: 'spring', stiffness: 380, damping: 16 },
} satisfies Record<string, Transition>;

/** Standard feedback for anything clickable. */
export const press = {
  whileHover: { scale: 1.03, y: -1 },
  whileTap: { scale: 0.95, y: 0 },
  transition: spring.snappy,
} as const;

/** Parent of a staggered entrance: children rise in one after another. */
export const stagger = (gap = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Child of `stagger`: fades up into place. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.smooth },
};

/**
 * For list items that are added and removed (use with AnimatePresence + layout).
 * Pass the item's index as `custom` to stagger the first load; new items at index 0 pop in at once.
 */
export const listItem: Variants = {
  hidden: { opacity: 0, y: -10, scale: 0.96 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, scale: 1, transition: { ...spring.bouncy, delay: Math.min(i, 8) * 0.05 } }),
  exit: { opacity: 0, x: -40, scale: 0.95, transition: { duration: 0.18 } },
};

/** Short horizontal shake for a rejected form. */
export const shake = { x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.4 } };
