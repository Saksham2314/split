import { AnimatePresence, motion } from 'motion/react';
import { Link, Navigate, Outlet, useLocation, useOutlet } from 'react-router';
import { useAuth } from '../auth';
import { spring } from '../lib/motion';
import { useFeedback } from './feedback';
import { Avatar, Button, Spinner } from './ui';

// /login and /register share one key, so switching between them morphs the form in place
// instead of running a full page transition.
const pageKey = (path: string) => (path === '/login' || path === '/register' ? 'auth' : path);

export function Layout() {
  const { user, logout } = useAuth();
  const { toast } = useFeedback();
  const location = useLocation();
  const outlet = useOutlet();

  async function onLogout() {
    await logout();
    toast('👋', 'Logged out. See you soon!', 'info');
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="aurora pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <span className="top-[-10%] left-[-10%] size-[45vw] bg-emerald-500" />
        <span className="top-[20%] right-[-15%] size-[40vw] bg-violet-600 [animation-delay:-7s]" />
        <span className="bottom-[-20%] left-[25%] size-[38vw] bg-cyan-500 [animation-delay:-14s]" />
      </div>

      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring.smooth}
        className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/60 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="group flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <motion.span
              className="inline-block text-2xl"
              whileHover={{ rotate: [0, -18, 14, -8, 0], scale: 1.2 }}
              transition={{ duration: 0.6 }}
            >
              💸
            </motion.span>
            <span className="text-gradient">SplitSmart</span>
          </Link>
          <AnimatePresence>
            {user && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={spring.smooth}
                className="flex items-center gap-3 text-sm"
              >
                <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pr-3 pl-1 sm:flex">
                  <Avatar userId={user.id} size="sm" />
                  <span className="text-zinc-300">{user.name}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
                  Log out 🚪
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={pageKey(location.pathname)}
            initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(4px)', transition: { duration: 0.15 } }}
            transition={spring.smooth}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/** Route guard: shows a spinner while the session is checked, then redirects to /login if needed. */
export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) {
    return (
      <div className="grid place-items-center py-24 text-emerald-300">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
