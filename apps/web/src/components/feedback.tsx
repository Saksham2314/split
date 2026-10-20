import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { spring } from '../lib/motion';
import { Button } from './ui';

// App-wide feedback: toasts, a confirm dialog (replaces window.confirm), emoji bursts and
// confetti, plus a tiny spark wherever the user clicks. One provider, three hooks.

interface Toast {
  id: number;
  emoji: string;
  text: string;
  tone: 'success' | 'error' | 'info';
}
interface ConfirmOptions {
  emoji: string;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}
interface Particle {
  id: number;
  emoji: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rotate: number;
  scale: number;
  delay: number;
}

interface Feedback {
  toast: (emoji: string, text: string, tone?: Toast['tone']) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Emojis fly out from a point (default: where the user last clicked). */
  burst: (emojis: string[], count?: number, from?: { x: number; y: number }) => void;
  /** Confetti rains from the top of the screen. */
  confetti: () => void;
}

const FeedbackContext = createContext<Feedback | null>(null);

let nextId = 1;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number }[]>([]);
  const lastPointer = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // Remember where every click lands (for bursts) and drop a small spark ring there.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      if (reduceMotion) return;
      const id = nextId++;
      setSparks((s) => [...s.slice(-6), { id, x: e.clientX, y: e.clientY }]);
    }
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [reduceMotion]);

  const toast = useCallback<Feedback['toast']>((emoji, text, tone = 'success') => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, emoji, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const confirm = useCallback<Feedback['confirm']>(
    (options) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  );

  const spawn = useCallback(
    (make: () => Omit<Particle, 'id'>, count: number) => {
      if (reduceMotion) return;
      const fresh = Array.from({ length: count }, () => ({ id: nextId++, ...make() }));
      setParticles((p) => [...p, ...fresh]);
      setTimeout(() => {
        const ids = new Set(fresh.map((f) => f.id));
        setParticles((p) => p.filter((x) => !ids.has(x.id)));
      }, 2200);
    },
    [reduceMotion],
  );

  const burst = useCallback<Feedback['burst']>(
    (emojis, count = 14, from) => {
      const { x, y } = from ?? lastPointer.current;
      spawn(() => {
        const angle = Math.random() * Math.PI * 2;
        const distance = 60 + Math.random() * 110;
        return {
          emoji: emojis[Math.floor(Math.random() * emojis.length)]!,
          x,
          y,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 40,
          rotate: (Math.random() - 0.5) * 240,
          scale: 0.8 + Math.random() * 0.8,
          delay: Math.random() * 0.08,
        };
      }, count);
    },
    [spawn],
  );

  const confetti = useCallback(() => {
    const pieces = ['🎉', '🎊', '✨', '💸', '🥳', '💚'];
    spawn(
      () => ({
        emoji: pieces[Math.floor(Math.random() * pieces.length)]!,
        x: Math.random() * window.innerWidth,
        y: -30,
        dx: (Math.random() - 0.5) * 160,
        dy: window.innerHeight * (0.6 + Math.random() * 0.5),
        rotate: (Math.random() - 0.5) * 720,
        scale: 0.8 + Math.random() * 1.1,
        delay: Math.random() * 0.5,
      }),
      46,
    );
  }, [spawn]);

  const close = useCallback(
    (ok: boolean) => {
      dialog?.resolve(ok);
      setDialog(null);
    },
    [dialog],
  );

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  const value = useMemo(() => ({ toast, confirm, burst, confetti }), [toast, confirm, burst, confetti]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {/* Click sparks */}
      <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
        <AnimatePresence>
          {sparks.map((s) => (
            <motion.span
              key={s.id}
              className="absolute size-6 rounded-full border-2 border-emerald-300/70"
              style={{ left: s.x - 12, top: s.y - 12 }}
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              onAnimationComplete={() => setSparks((all) => all.filter((x) => x.id !== s.id))}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Emoji particles */}
      <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
        {particles.map((p) => (
          <motion.span
            key={p.id}
            // Centring uses the CSS `translate` property; motion animates `transform`, so they compose.
            className="absolute -translate-1/2 text-2xl"
            style={{ left: p.x, top: p.y }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{ x: p.dx, y: p.dy, scale: p.scale, opacity: [1, 1, 0], rotate: p.rotate }}
            transition={{ duration: 1.3, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
          >
            {p.emoji}
          </motion.span>
        ))}
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9, transition: { duration: 0.2 } }}
              transition={spring.bouncy}
              className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
                t.tone === 'error'
                  ? 'border-rose-400/30 bg-rose-950/80 text-rose-100'
                  : t.tone === 'info'
                    ? 'border-white/10 bg-zinc-900/90 text-zinc-100'
                    : 'border-emerald-400/30 bg-emerald-950/80 text-emerald-50'
              }`}
            >
              <motion.span className="text-xl" initial={{ rotate: -30, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...spring.bouncy, delay: 0.1 }}>
                {t.emoji}
              </motion.span>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {dialog && (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-zinc-950/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              className="card w-full max-w-sm border-white/15 bg-zinc-900/90 text-center"
              initial={{ scale: 0.85, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 10, opacity: 0, transition: { duration: 0.15 } }}
              transition={spring.bouncy}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                className="mx-auto mb-3 text-5xl"
                initial={{ scale: 0, rotate: -40 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...spring.bouncy, delay: 0.08 }}
              >
                {dialog.emoji}
              </motion.div>
              <h2 id="confirm-title" className="text-lg font-bold">
                {dialog.title}
              </h2>
              {dialog.body && <div className="mt-1 text-sm text-zinc-400">{dialog.body}</div>}
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="ghost" onClick={() => close(false)} autoFocus>
                  Cancel
                </Button>
                <Button variant={dialog.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                  {dialog.confirmLabel}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedback(): Feedback {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}
