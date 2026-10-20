import { AnimatePresence, motion, useSpring, useTransform, type HTMLMotionProps } from 'motion/react';
import { useEffect, useState, type PointerEvent } from 'react';
import { avatarFor } from '../lib/emoji';
import { formatPaise } from '../lib/money';
import { press, spring } from '../lib/motion';

type Variant = 'primary' | 'ghost' | 'danger' | 'soft';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-linear-to-r from-emerald-400 to-cyan-400 text-zinc-950 shadow-[0_8px_30px_-8px_rgb(52_211_153/0.6)] hover:shadow-[0_10px_40px_-6px_rgb(52_211_153/0.8)]',
  ghost: 'border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:border-white/20',
  soft: 'bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20',
  danger: 'bg-rose-500 text-white shadow-[0_8px_30px_-8px_rgb(244_63_94/0.6)]',
};

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: Variant;
  busy?: boolean;
  size?: 'sm' | 'md';
}

/** Every button presses in, lifts on hover and sends a ripple out from where it was touched. */
export function Button({ variant = 'primary', busy, size = 'md', className = '', children, disabled, onPointerDown, ...rest }: ButtonProps) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  function ripple(e: PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipples((r) => [...r, { id: e.timeStamp, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    onPointerDown?.(e);
  }

  return (
    <motion.button
      {...press}
      {...rest}
      disabled={disabled || busy}
      onPointerDown={ripple}
      className={`relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl font-semibold whitespace-nowrap transition-[box-shadow,background-color,border-color] select-none disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
      } ${VARIANTS[variant]} ${className}`}
    >
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          className="pointer-events-none absolute size-8 rounded-full bg-white/40"
          style={{ left: r.x - 16, top: r.y - 16 }}
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 9, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          onAnimationComplete={() => setRipples((all) => all.filter((x) => x.id !== r.id))}
        />
      ))}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={busy ? 'busy' : 'idle'}
          className="relative inline-flex items-center gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={spring.snappy}
        >
          {busy ? <Spinner /> : children}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <motion.span
      aria-label="Loading"
      className={`inline-block rounded-full border-2 border-current border-t-transparent ${className}`}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
    />
  );
}

export function Avatar({ userId, size = 'md', ring = false }: { userId: number; size?: 'sm' | 'md' | 'lg'; ring?: boolean }) {
  const { emoji, gradient } = avatarFor(userId);
  const dims = { sm: 'size-7 text-sm', md: 'size-9 text-lg', lg: 'size-12 text-2xl' }[size];
  return (
    <motion.span
      whileHover={{ scale: 1.15, rotate: -8 }}
      transition={spring.bouncy}
      className={`inline-grid shrink-0 place-items-center rounded-full bg-linear-to-br ${gradient} ${dims} ${ring ? 'ring-2 ring-zinc-950' : ''}`}
      aria-hidden
    >
      {emoji}
    </motion.span>
  );
}

/** Overlapping avatars that pop in one by one. */
export function AvatarStack({ userIds, max = 5 }: { userIds: number[]; max?: number }) {
  const shown = userIds.slice(0, max);
  return (
    <div className="flex -space-x-2">
      {shown.map((id, i) => (
        <motion.span key={id} initial={{ scale: 0, y: 6 }} animate={{ scale: 1, y: 0 }} transition={{ ...spring.bouncy, delay: 0.15 + i * 0.06 }}>
          <Avatar userId={id} size="sm" ring />
        </motion.span>
      ))}
      {userIds.length > max && (
        <span className="grid size-7 place-items-center rounded-full bg-zinc-800 text-[10px] font-bold ring-2 ring-zinc-950">
          +{userIds.length - max}
        </span>
      )}
    </div>
  );
}

/** A rupee amount that counts smoothly to its new value whenever it changes. */
export function AnimatedMoney({ paise, className }: { paise: number; className?: string }) {
  const value = useSpring(0, { stiffness: 90, damping: 20 });
  const text = useTransform(value, (v) => formatPaise(Math.round(v)));
  useEffect(() => {
    value.set(paise);
  }, [value, paise]);
  return <motion.span className={`tabular-nums ${className ?? ''}`}>{text}</motion.span>;
}

export function ErrorText({ message }: { message: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          key={message}
          role="alert"
          initial={{ opacity: 0, height: 0, x: 0 }}
          animate={{ opacity: 1, height: 'auto', x: [0, -8, 7, -4, 0] }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.35 }}
          className="overflow-hidden rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
        >
          😬 {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-2xl ${className}`} />;
}
