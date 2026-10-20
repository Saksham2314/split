import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth';
import { useFeedback } from '../components/feedback';
import { Button, ErrorText } from '../components/ui';
import { api } from '../lib/api';
import { rise, shake, spring, stagger } from '../lib/motion';

const OAUTH_ERRORS: Record<string, [string, string]> = {
  cancelled: ['🙅', 'Google sign-in was cancelled'],
  invalid_state: ['⏱️', 'That sign-in attempt expired. Please try again'],
  google_failed: ['😵', "Couldn't sign in with Google. Please try again"],
  email_unverified: ['📧', 'Your Google email address is not verified yet'],
  email_exists: ['🔑', 'That email already has a password account. Log in with your password'],
};

const HERO_CARDS = [
  { emoji: '🍕', text: 'Asha paid ₹1,200', sub: 'Pizza night · split 4 ways', className: 'top-0 left-0 rotate-[-6deg]' },
  { emoji: '🛵', text: 'Ravi paid ₹600', sub: 'Scooter rent · Goa', className: 'top-28 right-0 rotate-[5deg]' },
  { emoji: '✅', text: 'Meena settled up', sub: 'with 2 payments, not 6', className: 'top-56 left-10 rotate-[-2deg]' },
];

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, setUser } = useAuth();
  const { toast, burst } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const card = useAnimationControls();
  const oauthErrorShown = useRef(false);

  useEffect(() => {
    api
      .providers()
      .then((p) => setGoogleEnabled(p.google))
      .catch(() => setGoogleEnabled(false));
  }, []);

  // Coming back from a failed Google sign-in: explain why once, then tidy the URL.
  useEffect(() => {
    const reason = params.get('oauth_error');
    if (!reason || oauthErrorShown.current) return;
    oauthErrorShown.current = true;
    const [emoji, text] = OAUTH_ERRORS[reason] ?? OAUTH_ERRORS.google_failed!;
    toast(emoji, text, 'error');
    setParams({}, { replace: true });
  }, [params, setParams, toast]);

  if (user) return <Navigate to="/" replace />;
  const isRegister = mode === 'register';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = isRegister ? await api.register(name, email, password) : await api.login(email, password);
      burst(['🎉', '✨', '💸', '🥳']);
      toast(isRegister ? '🎉' : '👋', isRegister ? `Welcome aboard, ${res.user.name}!` : `Welcome back, ${res.user.name}!`);
      setUser(res.user);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      void card.start(shake);
    } finally {
      setBusy(false);
    }
  }

  function onGoogle() {
    if (!googleEnabled) {
      toast('🔧', "Google sign-in isn't enabled on this server yet", 'info');
      return;
    }
    // Full-page navigation: the API redirects to Google and back, then sets the session cookie.
    window.location.assign('/api/auth/google');
  }

  return (
    <div className="grid items-center gap-10 lg:min-h-[70vh] lg:grid-cols-2">
      <motion.section variants={stagger(0.1)} initial="hidden" animate="show" className="hidden lg:block">
        <motion.p variants={rise} className="mb-3 inline-block rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          ✨ Fewest payments, zero awkwardness
        </motion.p>
        <motion.h1 variants={rise} className="text-5xl leading-[1.05] font-extrabold tracking-tight">
          Split bills.
          <br />
          <span className="text-gradient">Keep friends.</span>
        </motion.h1>
        <motion.p variants={rise} className="mt-4 max-w-md text-zinc-400">
          Track shared costs for trips, flats and dinners. SplitSmart works out who owes whom, down to the paisa. 🪙
        </motion.p>
        <motion.div variants={rise} className="relative mt-10 h-80 max-w-md">
          {HERO_CARDS.map((c, i) => (
            <motion.div
              key={c.text}
              className={`card absolute flex w-64 items-center gap-3 p-4 ${c.className}`}
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.7 }}
              whileHover={{ scale: 1.06, rotate: 0 }}
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-2xl">{c.emoji}</span>
              <span>
                <span className="block text-sm font-semibold">{c.text}</span>
                <span className="block text-xs text-zinc-400">{c.sub}</span>
              </span>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      <motion.div animate={card} className="mx-auto w-full max-w-md">
        <motion.div layout transition={spring.smooth} className="card space-y-5 p-6 sm:p-8">
          <motion.div layout="position" className="text-center">
            <motion.div
              key={mode}
              className="mb-2 text-5xl"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={spring.bouncy}
            >
              {isRegister ? '🚀' : '👋'}
            </motion.div>
            <h2 className="text-2xl font-bold">{isRegister ? 'Create your account' : 'Welcome back'}</h2>
            <p className="mt-1 text-sm text-zinc-400">{isRegister ? 'It takes about 20 seconds.' : 'Good to see you again.'}</p>
          </motion.div>

          {/* Segmented toggle: the highlight pill slides between the two options. */}
          <motion.div layout="position" className="grid grid-cols-2 rounded-xl border border-white/10 bg-white/[0.03] p-1 text-sm font-semibold">
            {(['login', 'register'] as const).map((m) => (
              <Link key={m} to={m === 'login' ? '/login' : '/register'} replace state={location.state} className="relative rounded-lg py-2 text-center">
                {mode === m && <motion.span layoutId="auth-toggle" className="absolute inset-0 rounded-lg bg-white/10" transition={spring.snappy} />}
                <span className={`relative ${mode === m ? 'text-white' : 'text-zinc-400'}`}>{m === 'login' ? '🔐 Log in' : '✨ Sign up'}</span>
              </Link>
            ))}
          </motion.div>

          <motion.div layout="position">
            <Button type="button" variant="ghost" className="w-full py-3" onClick={onGoogle} aria-disabled={googleEnabled === false}>
              <GoogleIcon />
              Continue with Google
            </Button>
          </motion.div>

          <motion.div layout="position" className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-white/10" /> or with email <span className="h-px flex-1 bg-white/10" />
          </motion.div>

          <form onSubmit={onSubmit} className="space-y-4">
            <AnimatePresence initial={false}>
              {isRegister && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring.smooth}
                  className="overflow-hidden"
                >
                  <label className="label" htmlFor="name">😊 Name</label>
                  <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" placeholder="Asha" />
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div layout="position">
              <label className="label" htmlFor="email">📧 Email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
            </motion.div>
            <motion.div layout="position">
              <label className="label" htmlFor="password">🔒 Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isRegister ? 8 : 1}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.8 }}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-lg"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={String(showPassword)} className="block" initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} exit={{ rotate: 90, scale: 0 }} transition={spring.snappy}>
                      {showPassword ? '🙈' : '👁️'}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
              {isRegister && <PasswordMeter password={password} />}
            </motion.div>
            <ErrorText message={error} />
            <motion.div layout="position">
              <Button className="w-full py-3" busy={busy}>
                {isRegister ? 'Create account 🚀' : 'Log in →'}
              </Button>
            </motion.div>
          </form>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Fills as the password gets longer; turns green once it meets the 8-character minimum. */
function PasswordMeter({ password }: { password: string }) {
  const progress = Math.min(password.length / 12, 1);
  const ok = password.length >= 8;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className={`h-full rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`}
          animate={{ width: `${progress * 100}%` }}
          transition={spring.smooth}
        />
      </div>
      <span className="w-24 text-right text-xs text-zinc-400">{ok ? '💪 Good to go' : `${8 - password.length} more…`}</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
