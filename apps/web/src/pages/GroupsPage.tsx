import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth';
import { useFeedback } from '../components/feedback';
import { Button, ErrorText, Skeleton } from '../components/ui';
import { api, type GroupSummary } from '../lib/api';
import { groupEmoji } from '../lib/emoji';
import { listItem, rise, spring, stagger } from '../lib/motion';

const MotionLink = motion.create(Link);

export function GroupsPage() {
  const { user } = useAuth();
  const { toast, burst } = useFeedback();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listGroups()
      .then((res) => setGroups(res.groups))
      .catch((err: Error) => setError(err.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { group } = await api.createGroup(name);
      setGroups((prev) => [{ ...group, memberCount: 1 }, ...(prev ?? [])]);
      setName('');
      burst([groupEmoji(group.name), '✨', '🎈']);
      toast(groupEmoji(group.name), `“${group.name}” is ready. Add your crew!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group');
    } finally {
      setBusy(false);
    }
  }

  const firstName = user?.name.split(' ')[0];
  const previewEmoji = groupEmoji(name || 'new');

  return (
    <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={rise}>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Hey {firstName}{' '}
          <motion.span
            className="inline-block origin-[70%_70%]"
            animate={{ rotate: [0, 18, -8, 18, -4, 10, 0] }}
            transition={{ duration: 1.6, delay: 0.4 }}
          >
            👋
          </motion.span>
        </h1>
        <p className="mt-1 text-zinc-400">Trips, flatmates, dinners: one group per set of shared costs.</p>
      </motion.div>

      <motion.form variants={rise} onSubmit={onCreate} className="card flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="absolute top-1/2 left-3 -translate-y-1/2 text-xl">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={previewEmoji} className="block" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 45 }} transition={spring.bouncy}>
                {previewEmoji}
              </motion.span>
            </AnimatePresence>
          </span>
          <input
            className="input py-3 pl-11 text-base"
            placeholder="Name a new group: Goa trip, Flat 302, Friday dinners…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            aria-label="New group name"
          />
        </div>
        <Button busy={busy} className="py-3">Create group ✨</Button>
      </motion.form>
      <ErrorText message={error} />

      {groups === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <motion.div variants={rise} className="card py-14 text-center">
          <motion.div className="mb-3 text-6xl" animate={{ y: [0, -12, 0], rotate: [0, 6, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}>
            🪄
          </motion.div>
          <p className="text-lg font-semibold">No groups yet</p>
          <p className="text-sm text-zinc-400">Create one above to start splitting expenses.</p>
        </motion.div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {groups.map((g, i) => (
              <motion.li
                key={g.id}
                layout
                variants={listItem}
                initial="hidden"
                animate="show"
                exit="exit"
                custom={i}
              >
                <MotionLink
                  to={`/groups/${g.id}`}
                  className="card group block h-full transition-colors hover:border-emerald-400/40"
                  whileHover={{ y: -6, rotate: -0.6 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring.snappy}
                >
                  <div className="flex items-start justify-between">
                    <motion.span
                      className="grid size-14 place-items-center rounded-2xl bg-linear-to-br from-white/15 to-white/5 text-3xl"
                      whileHover={{ scale: 1.15, rotate: 10 }}
                      transition={spring.bouncy}
                    >
                      {groupEmoji(g.name)}
                    </motion.span>
                    <span className="text-zinc-500 transition group-hover:translate-x-1 group-hover:text-emerald-300">→</span>
                  </div>
                  <p className="mt-4 truncate text-lg font-bold">{g.name}</p>
                  <p className="text-sm text-zinc-400">
                    👥 {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                  </p>
                </MotionLink>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}
