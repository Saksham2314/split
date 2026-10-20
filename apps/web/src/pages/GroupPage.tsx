import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth';
import { useFeedback } from '../components/feedback';
import { AnimatedMoney, Avatar, AvatarStack, Button, ErrorText, Skeleton } from '../components/ui';
import { api, type Balances, type Expense, type GroupDetail, type Settlement, type Transfer, type User } from '../lib/api';
import { expenseEmoji, groupEmoji } from '../lib/emoji';
import { formatPaise, parseRupeesToPaise } from '../lib/money';
import { listItem, rise, spring, stagger } from '../lib/motion';

interface GroupData {
  group: GroupDetail;
  expenses: Expense[];
  settlements: Settlement[];
  balances: Balances;
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the user's timezone

export function GroupPage() {
  const groupId = Number(useParams().groupId);
  const { user } = useAuth();
  const [data, setData] = useState<GroupData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [g, e, s, b] = await Promise.all([
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.listSettlements(groupId),
        api.balances(groupId),
      ]);
      setData({ group: g.group, expenses: e.expenses, settlements: s.settlements, balances: b });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load group');
    }
  }, [groupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [reload]);

  if (!data) {
    return error ? (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <div className="text-6xl">🧭</div>
        <ErrorText message={error} />
        <BackLink />
      </div>
    ) : (
      <div className="space-y-6">
        <Skeleton className="h-20 w-72" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-96 lg:col-span-3" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  const nameOf = (id: number) => (id === user?.id ? 'You' : (data.group.members.find((m) => m.id === id)?.name ?? `User ${id}`));
  const totalSpent = data.expenses.reduce((sum, e) => sum + e.amountPaise, 0);
  const myNet = data.balances.balances.find((b) => b.userId === user?.id)?.netPaise ?? 0;

  return (
    <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <BackLink />
          <div className="mt-2 flex items-center gap-3">
            <motion.span
              className="grid size-14 place-items-center rounded-2xl bg-linear-to-br from-white/15 to-white/5 text-3xl"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              whileHover={{ rotate: [0, -12, 12, 0], scale: 1.1 }}
              transition={spring.bouncy}
            >
              {groupEmoji(data.group.name)}
            </motion.span>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{data.group.name}</h1>
          </div>
        </div>
        <AvatarStack userIds={data.group.members.map((m) => m.id)} max={6} />
      </motion.div>

      <motion.div variants={stagger(0.07)} className="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat emoji="💰" label="Total spent">
          <AnimatedMoney paise={totalSpent} />
        </Stat>
        <Stat emoji="🧾" label="Expenses">
          <span className="tabular-nums">{data.expenses.length}</span>
        </Stat>
        <Stat emoji={myNet > 0 ? '🤑' : myNet < 0 ? '🫣' : '😌'} label={myNet > 0 ? 'You get back' : myNet < 0 ? 'You owe' : 'Your balance'}>
          {myNet === 0 ? (
            <span className="text-zinc-300">All square ✨</span>
          ) : (
            <AnimatedMoney paise={Math.abs(myNet)} className={myNet > 0 ? 'text-emerald-300' : 'text-rose-300'} />
          )}
        </Stat>
      </motion.div>

      <ErrorText message={error} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <motion.div variants={rise}>
            <AddExpenseForm groupId={groupId} members={data.group.members} onAdded={reload} />
          </motion.div>
          <motion.div variants={rise}>
            <History data={data} nameOf={nameOf} groupId={groupId} onChanged={reload} />
          </motion.div>
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <motion.div variants={rise}>
            <BalancesCard balances={data.balances} groupId={groupId} nameOf={nameOf} currentUserId={user?.id} onSettled={reload} />
          </motion.div>
          <motion.div variants={rise}>
            <MembersCard groupId={groupId} members={data.group.members} currentUserId={user?.id} onAdded={reload} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function BackLink() {
  return (
    <Link to="/" className="group inline-flex items-center gap-1 text-sm font-medium text-emerald-300 hover:text-emerald-200">
      <span className="transition-transform group-hover:-translate-x-1">←</span> All groups
    </Link>
  );
}

function Stat({ emoji, label, children }: { emoji: string; label: string; children: ReactNode }) {
  return (
    <motion.div variants={rise} whileHover={{ y: -4 }} transition={spring.snappy} className="card flex min-w-0 flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <motion.span
        key={emoji}
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-lg sm:size-12 sm:rounded-2xl sm:text-2xl"
        initial={{ scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={spring.bouncy}
      >
        {emoji}
      </motion.span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold tracking-wider text-zinc-400 uppercase sm:text-xs">{label}</p>
        <p className="truncate text-sm font-bold sm:text-xl">{children}</p>
      </div>
    </motion.div>
  );
}

function SectionTitle({ emoji, children, aside }: { emoji: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <span>{emoji}</span> {children}
      </h2>
      {aside}
    </div>
  );
}

function AddExpenseForm({ groupId, members, onAdded }: { groupId: number; members: User[]; onAdded: () => Promise<void> }) {
  const { user } = useAuth();
  const { toast, burst } = useFeedback();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<number>(user?.id ?? members[0]!.id);
  const [participants, setParticipants] = useState<Set<number>>(() => new Set(members.map((m) => m.id)));
  const [spentOn, setSpentOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountPaise = parseRupeesToPaise(amount);
  const perHead = amountPaise && participants.size ? Math.floor(amountPaise / participants.size) : null;
  const emoji = expenseEmoji(description);

  function toggle(id: number) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (amountPaise === null) return setError('Enter a valid amount, e.g. 450 or 450.50');
    if (participants.size === 0) return setError('Choose at least one person to split with');
    setError(null);
    setBusy(true);
    try {
      await api.addExpense(groupId, { description, amountPaise, paidBy, participantIds: [...participants], spentOn });
      burst([emoji, '💸', '✨', emoji]);
      toast(emoji, `Added “${description}” · ${formatPaise(amountPaise)}`);
      setDescription('');
      setAmount('');
      await onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add expense');
    } finally {
      setBusy(false);
    }
  }

  const allSelected = participants.size === members.length;

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <SectionTitle emoji="➕">Add an expense</SectionTitle>

      <div className="grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-3">
          <label className="label" htmlFor="desc">What was it?</label>
          <div className="relative">
            <span className="absolute top-1/2 left-2.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg bg-white/[0.07] text-lg">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={emoji} initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 60 }} transition={spring.bouncy}>
                  {emoji}
                </motion.span>
              </AnimatePresence>
            </span>
            <input id="desc" className="input pl-13" value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={200} placeholder="Dinner at Thalassa" />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="amount">Amount</label>
          <div className="relative">
            <span className="absolute top-1/2 left-3.5 -translate-y-1/2 font-bold text-zinc-400">₹</span>
            <input id="amount" className="input pl-8 text-lg font-bold tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <fieldset className="sm:col-span-3">
          <legend className="label">Paid by</legend>
          <LayoutGroup id="payer">
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <motion.button
                  key={m.id}
                  type="button"
                  onClick={() => setPaidBy(m.id)}
                  whileTap={{ scale: 0.92 }}
                  className="relative flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm"
                  aria-pressed={paidBy === m.id}
                >
                  {paidBy === m.id && (
                    <motion.span layoutId="payer-pill" className="absolute inset-0 rounded-full border border-emerald-400/50 bg-emerald-400/15" transition={spring.snappy} />
                  )}
                  <span className="relative"><Avatar userId={m.id} size="sm" /></span>
                  <span className={`relative ${paidBy === m.id ? 'text-emerald-100' : 'text-zinc-400'}`}>{m.id === user?.id ? 'You' : m.name}</span>
                </motion.button>
              ))}
            </div>
          </LayoutGroup>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="spentOn">📅 Date</label>
          <input id="spentOn" type="date" className="input" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} required />
        </div>
      </div>

      <fieldset>
        <div className="mb-1.5 flex items-center justify-between">
          <legend className="label mb-0">Split equally between</legend>
          <button
            type="button"
            className="text-xs font-semibold text-emerald-300 hover:text-emerald-200"
            onClick={() => setParticipants(allSelected ? new Set() : new Set(members.map((m) => m.id)))}
          >
            {allSelected ? 'Clear' : 'Everyone'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const on = participants.has(m.id);
            return (
              <motion.label
                key={m.id}
                whileTap={{ scale: 0.9 }}
                animate={{ scale: on ? 1 : 0.97 }}
                transition={spring.snappy}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-100' : 'border-white/10 text-zinc-500 hover:border-white/20'
                }`}
              >
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(m.id)} />
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span key={String(on)} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring.bouncy}>
                    {on ? '✅' : '⬜'}
                  </motion.span>
                </AnimatePresence>
                {m.id === user?.id ? 'You' : m.name}
              </motion.label>
            );
          })}
        </div>
        <AnimatePresence>
          {perHead !== null && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden text-sm text-zinc-400"
            >
              🍰 ≈ <AnimatedMoney paise={perHead} className="font-semibold text-zinc-100" /> each · {participants.size}{' '}
              {participants.size === 1 ? 'person' : 'people'}
            </motion.p>
          )}
        </AnimatePresence>
      </fieldset>

      <ErrorText message={error} />
      <Button busy={busy} className="w-full py-3 sm:w-auto">
        Add expense {emoji}
      </Button>
    </form>
  );
}

function BalancesCard({
  balances,
  groupId,
  nameOf,
  currentUserId,
  onSettled,
}: {
  balances: Balances;
  groupId: number;
  nameOf: (id: number) => string;
  currentUserId: number | undefined;
  onSettled: () => Promise<void>;
}) {
  const { toast, confirm, confetti, burst } = useFeedback();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const maxAbs = Math.max(1, ...balances.balances.map((b) => Math.abs(b.netPaise)));
  const settled = balances.suggestedTransfers.length === 0;

  // Throw confetti when the group goes from "someone owes" to "everyone is square".
  const wasSettled = useRef(settled);
  useEffect(() => {
    if (settled && !wasSettled.current) confetti();
    wasSettled.current = settled;
  }, [settled, confetti]);

  async function record(t: Transfer) {
    const ok = await confirm({
      emoji: '🤝',
      title: 'Mark as paid?',
      body: (
        <>
          <b className="text-zinc-200">{nameOf(t.fromUserId)}</b> paid <b className="text-zinc-200">{nameOf(t.toUserId)}</b>{' '}
          <b className="text-emerald-300">{formatPaise(t.amountPaise)}</b>
        </>
      ),
      confirmLabel: 'Yes, paid ✅',
    });
    if (!ok) return;
    const key = `${t.fromUserId}-${t.toUserId}`;
    setBusyKey(key);
    setError(null);
    try {
      await api.addSettlement(groupId, t);
      burst(['💸', '✅', '🤝']);
      toast('🤝', `${nameOf(t.fromUserId)} → ${nameOf(t.toUserId)} · ${formatPaise(t.amountPaise)} recorded`);
      await onSettled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="card">
      <SectionTitle emoji="⚖️">Balances</SectionTitle>
      <ul className="space-y-3">
        {balances.balances.map((b, i) => {
          const share = Math.abs(b.netPaise) / maxAbs;
          return (
            <motion.li key={b.userId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.smooth, delay: i * 0.05 }}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <Avatar userId={b.userId} size="sm" />
                  <span className="font-medium">{b.userId === currentUserId ? 'You' : b.name}</span>
                </span>
                <span className={b.netPaise > 0 ? 'text-emerald-300' : b.netPaise < 0 ? 'text-rose-300' : 'text-zinc-500'}>
                  {b.netPaise === 0 ? (
                    'settled ✨'
                  ) : (
                    <>
                      {b.netPaise > 0 ? 'gets ' : 'owes '}
                      <AnimatedMoney paise={Math.abs(b.netPaise)} className="font-semibold" />
                    </>
                  )}
                </span>
              </div>
              {/* Diverging bar: owing grows left of centre, getting back grows right. */}
              <div className="relative h-1.5 rounded-full bg-white/[0.06]">
                <span className="absolute top-0 left-1/2 h-full w-px bg-white/20" />
                <motion.span
                  className={`absolute top-0 h-full rounded-full ${b.netPaise >= 0 ? 'left-1/2 bg-linear-to-r from-emerald-500 to-emerald-300' : 'right-1/2 bg-linear-to-l from-rose-500 to-rose-300'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${share * 50}%` }}
                  transition={{ ...spring.smooth, delay: 0.2 + i * 0.05 }}
                />
              </div>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-6">
        <h3 className="mb-3 text-xs font-semibold tracking-wider text-zinc-400 uppercase">Suggested payments</h3>
        <AnimatePresence mode="wait">
          {settled ? (
            <motion.div key="settled" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.bouncy} className="rounded-2xl bg-emerald-400/10 py-6 text-center">
              <motion.div className="text-4xl" animate={{ y: [0, -8, 0], rotate: [0, -10, 10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                🎉
              </motion.div>
              <p className="mt-2 font-semibold text-emerald-200">Everyone is square!</p>
            </motion.div>
          ) : (
            <motion.ul key="transfers" className="relative space-y-2" exit={{ opacity: 0 }}>
              <AnimatePresence mode="popLayout">
                {balances.suggestedTransfers.map((t, i) => {
                  const key = `${t.fromUserId}-${t.toUserId}`;
                  return (
                    <motion.li
                      key={key}
                      layout
                      variants={listItem}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      custom={i}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar userId={t.fromUserId} size="sm" />
                        <FlowArrow />
                        <Avatar userId={t.toUserId} size="sm" />
                        <div className="min-w-0 pl-1 text-sm">
                          <p className="truncate text-zinc-400">
                            <b className="text-zinc-200">{nameOf(t.fromUserId)}</b> → <b className="text-zinc-200">{nameOf(t.toUserId)}</b>
                          </p>
                          <p className="font-bold text-emerald-300 tabular-nums">{formatPaise(t.amountPaise)}</p>
                        </div>
                      </div>
                      <Button variant="soft" size="sm" busy={busyKey === key} disabled={busyKey !== null} onClick={() => void record(t)}>
                        Mark paid ✅
                      </Button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-3">
        <ErrorText message={error} />
      </div>
    </section>
  );
}

/** Three dots travelling left to right: money flowing from payer to payee. */
function FlowArrow() {
  return (
    <span className="relative flex w-8 items-center" aria-hidden>
      <span className="h-px w-full bg-white/15" />
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 rounded-full bg-emerald-300"
          animate={{ left: ['0%', '100%'], opacity: [0, 1, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.45, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

function MembersCard({ groupId, members, currentUserId, onAdded }: { groupId: number; members: User[]; currentUserId: number | undefined; onAdded: () => Promise<void> }) {
  const { toast, burst } = useFeedback();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { member } = await api.addMember(groupId, email);
      setEmail('');
      burst(['👋', '🎉', '🙌']);
      toast('👋', `${member.name} joined the group`);
      await onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4">
      <SectionTitle emoji="👥" aside={<span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-zinc-300">{members.length}</span>}>
        Members
      </SectionTitle>
      <ul className="relative space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {members.map((m, i) => (
            <motion.li key={m.id} layout variants={listItem} initial="hidden" animate="show" exit="exit" custom={i} className="flex items-center gap-3">
              <Avatar userId={m.id} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.id === currentUserId && <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase">you</span>}
                </p>
                <p className="truncate text-xs text-zinc-500">{m.email}</p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input type="email" className="input" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Member email" />
        <Button variant="ghost" busy={busy}>Add 👋</Button>
      </form>
      <p className="text-xs text-zinc-500">💡 They need a SplitSmart account first.</p>
      <ErrorText message={error} />
    </section>
  );
}

type HistoryItem = { kind: 'expense'; date: string; item: Expense } | { kind: 'settlement'; date: string; item: Settlement };
type Filter = 'all' | 'expense' | 'settlement';
const FILTERS: [Filter, string][] = [
  ['all', '✨ All'],
  ['expense', '🧾 Expenses'],
  ['settlement', '💸 Payments'],
];

function History({ data, nameOf, groupId, onChanged }: { data: GroupData; nameOf: (id: number) => string; groupId: number; onChanged: () => Promise<void> }) {
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number | null>(null);

  const items = useMemo<HistoryItem[]>(
    () =>
      [
        ...data.expenses.map((e) => ({ kind: 'expense' as const, date: e.spentOn, item: e })),
        ...data.settlements.map((s) => ({ kind: 'settlement' as const, date: s.createdAt.slice(0, 10), item: s })),
      ]
        .filter((h) => filter === 'all' || h.kind === filter)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data, filter],
  );

  async function remove(expense: Expense) {
    const ok = await confirm({
      emoji: '🗑️',
      title: `Delete “${expense.description}”?`,
      body: `${formatPaise(expense.amountPaise)} will be removed and balances recalculated.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteExpense(groupId, expense.id);
      toast('🗑️', `Deleted “${expense.description}”`, 'info');
      await onChanged();
    } catch (err) {
      toast('😬', err instanceof Error ? err.message : 'Could not delete expense', 'error');
    }
  }

  return (
    <section className="card">
      <SectionTitle
        emoji="📜"
        aside={
          <LayoutGroup id="history-filter">
            <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 text-xs font-semibold">
              {FILTERS.map(([f, label]) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className="relative rounded-lg px-2.5 py-1.5">
                  {filter === f && <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-lg bg-white/10" transition={spring.snappy} />}
                  <span className={`relative ${filter === f ? 'text-white' : 'text-zinc-400'}`}>{label}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
        }
      >
        History
      </SectionTitle>

      {items.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center text-zinc-500">
          <motion.div className="mb-2 text-4xl" animate={{ y: [0, -6, 0] }} transition={{ duration: 2.5, repeat: Infinity }}>
            🌱
          </motion.div>
          Nothing here yet.
        </motion.div>
      ) : (
        <ul className="relative space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((h, i) =>
              h.kind === 'expense' ? (
                <motion.li key={`e${h.item.id}`} layout variants={listItem} initial="hidden" animate="show" exit="exit" custom={i}>
                  <div className="group rounded-2xl border border-white/5 bg-white/[0.02] transition-colors hover:border-white/10 hover:bg-white/[0.05]">
                    <div className="flex items-center gap-3 p-3">
                      <motion.button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => setOpen(open === h.item.id ? null : h.item.id)}
                        aria-expanded={open === h.item.id}
                        whileTap={{ scale: 0.98 }}
                      >
                        <motion.span whileHover={{ rotate: 12, scale: 1.1 }} transition={spring.bouncy} className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-xl">
                          {expenseEmoji(h.item.description)}
                        </motion.span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{h.item.description}</span>
                          <span className="block truncate text-xs text-zinc-500">
                            {h.date} · {nameOf(h.item.paidBy)} paid · split {h.item.shares.length} ways
                          </span>
                        </span>
                      </motion.button>
                      <span className="font-bold tabular-nums">{formatPaise(h.item.amountPaise)}</span>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.2, rotate: -10 }}
                        whileTap={{ scale: 0.8 }}
                        className="rounded-lg p-1.5 text-sm opacity-50 transition-opacity group-hover:opacity-100 hover:bg-rose-500/15"
                        onClick={() => void remove(h.item)}
                        aria-label={`Delete ${h.item.description}`}
                      >
                        🗑️
                      </motion.button>
                    </div>
                    <AnimatePresence initial={false}>
                      {open === h.item.id && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={spring.smooth}
                          className="overflow-hidden px-3"
                        >
                          {h.item.shares.map((s, j) => (
                            <motion.li
                              key={s.userId}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: j * 0.04 }}
                              className="flex items-center justify-between border-t border-white/5 py-2 text-sm first:mb-0 last:mb-2"
                            >
                              <span className="flex items-center gap-2 text-zinc-300">
                                <Avatar userId={s.userId} size="sm" /> {nameOf(s.userId)}
                              </span>
                              <span className="text-zinc-400 tabular-nums">{formatPaise(s.sharePaise)}</span>
                            </motion.li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.li>
              ) : (
                <motion.li
                  key={`s${h.item.id}`}
                  layout
                  variants={listItem}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  custom={i}
                  className="flex items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3 text-sm"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-xl">🤝</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-zinc-200">
                      {nameOf(h.item.fromUserId)} paid {nameOf(h.item.toUserId)}
                    </span>
                    <span className="block text-xs text-zinc-500">{h.date} · settlement</span>
                  </span>
                  <span className="font-bold text-emerald-300 tabular-nums">{formatPaise(h.item.amountPaise)}</span>
                </motion.li>
              ),
            )}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
