import { Router, type Request } from 'express';
import { z } from 'zod';
import { withTransaction, type Db } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { MAX_AMOUNT_PAISE, simplifyDebts, splitEqually } from '../lib/money.js';
import { id, parse } from '../lib/validate.js';
import { currentUserId } from '../middleware/auth.js';

const GroupBody = z.object({ name: z.string().trim().min(1).max(100) });
const AddMemberBody = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });
const amountPaise = z.number().int().positive().max(MAX_AMOUNT_PAISE);

const ExpenseBody = z.object({
  description: z.string().trim().min(1).max(200),
  amountPaise,
  paidBy: id,
  participantIds: z.array(id).min(1).max(100),
  spentOn: z.iso.date().optional(),
});

const SettlementBody = z
  .object({ fromUserId: id, toUserId: id, amountPaise })
  .refine((s) => s.fromUserId !== s.toUserId, 'A member cannot pay themselves');

interface Member {
  id: number;
  name: string;
  email: string;
}

export function groupsRouter(db: Db): Router {
  const router = Router();

  /**
   * Authorization check used by every /groups/:groupId route. Non-members get 404
   * rather than 403, so the API doesn't even reveal that the group exists.
   * Returns the group's members (needed by most handlers anyway).
   */
  async function loadGroupForMember(req: Request): Promise<{ groupId: number; members: Member[] }> {
    const groupId = parse(id, req.params.groupId);
    const { rows } = await db.query<Member>(
      `SELECT u.id, u.name, u.email
         FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1
        ORDER BY m.joined_at, u.id`,
      [groupId],
    );
    if (!rows.some((m) => m.id === currentUserId(req))) throw notFound('Group not found');
    return { groupId, members: rows };
  }

  function assertMembers(members: Member[], userIds: number[]): void {
    const memberIds = new Set(members.map((m) => m.id));
    const outsiders = userIds.filter((u) => !memberIds.has(u));
    if (outsiders.length > 0) throw badRequest('All people involved must be members of the group', { outsiders });
  }

  router.get('/', async (req, res) => {
    const { rows } = await db.query(
      `SELECT g.id, g.name, g.created_at AS "createdAt",
              (SELECT count(*) FROM group_members c WHERE c.group_id = g.id)::int AS "memberCount"
         FROM groups g JOIN group_members m ON m.group_id = g.id
        WHERE m.user_id = $1
        ORDER BY g.created_at DESC, g.id DESC`,
      [currentUserId(req)],
    );
    res.json({ groups: rows });
  });

  router.post('/', async (req, res) => {
    const body = parse(GroupBody, req.body);
    const userId = currentUserId(req);
    // Creating the group and adding its creator must succeed or fail together.
    const group = await withTransaction(db, async (tx) => {
      const { rows } = await tx.query<{ id: number; name: string; createdAt: Date }>(
        `INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at AS "createdAt"`,
        [body.name, userId],
      );
      const created = rows[0]!;
      await tx.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [created.id, userId]);
      return created;
    });
    res.status(201).json({ group });
  });

  router.get('/:groupId', async (req, res) => {
    const { groupId, members } = await loadGroupForMember(req);
    const { rows } = await db.query('SELECT id, name, created_at AS "createdAt" FROM groups WHERE id = $1', [groupId]);
    res.json({ group: { ...rows[0], members } });
  });

  router.post('/:groupId/members', async (req, res) => {
    const { groupId } = await loadGroupForMember(req);
    const body = parse(AddMemberBody, req.body);
    const found = await db.query<Member>('SELECT id, name, email FROM users WHERE lower(email) = $1', [body.email]);
    const user = found.rows[0];
    if (!user) throw notFound('No registered user has that email. Ask them to sign up first.');

    const inserted = await db.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, user.id],
    );
    if (inserted.rowCount === 0) throw conflict('That person is already a member');
    res.status(201).json({ member: user });
  });

  router.get('/:groupId/expenses', async (req, res) => {
    const { groupId } = await loadGroupForMember(req);
    const { rows } = await db.query(
      `SELECT e.id, e.description, e.amount_paise AS "amountPaise", e.paid_by AS "paidBy",
              to_char(e.spent_on, 'YYYY-MM-DD') AS "spentOn", e.created_at AS "createdAt",
              json_agg(json_build_object('userId', s.user_id, 'sharePaise', s.share_paise)
                       ORDER BY s.user_id) AS shares
         FROM expenses e JOIN expense_shares s ON s.expense_id = e.id
        WHERE e.group_id = $1
        GROUP BY e.id
        ORDER BY e.spent_on DESC, e.id DESC`,
      [groupId],
    );
    res.json({ expenses: rows });
  });

  router.post('/:groupId/expenses', async (req, res) => {
    const { groupId, members } = await loadGroupForMember(req);
    const body = parse(ExpenseBody, req.body);
    assertMembers(members, [body.paidBy, ...body.participantIds]);
    const shares = splitEqually(body.amountPaise, body.participantIds);

    // The expense row and all of its share rows are written atomically:
    // a crash halfway can never leave an expense whose shares don't add up.
    const expense = await withTransaction(db, async (tx) => {
      const { rows } = await tx.query<{ id: number }>(
        `INSERT INTO expenses (group_id, description, amount_paise, paid_by, spent_on, created_by)
         VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6)
         RETURNING id, to_char(spent_on, 'YYYY-MM-DD') AS "spentOn", created_at AS "createdAt"`,
        [groupId, body.description, body.amountPaise, body.paidBy, body.spentOn ?? null, currentUserId(req)],
      );
      const created = rows[0]!;
      await tx.query(
        `INSERT INTO expense_shares (expense_id, group_id, user_id, share_paise)
         SELECT $1, $2, * FROM unnest($3::bigint[], $4::bigint[])`,
        [created.id, groupId, shares.map((s) => s.userId), shares.map((s) => s.sharePaise)],
      );
      return created;
    });

    res.status(201).json({
      expense: {
        ...expense,
        description: body.description,
        amountPaise: body.amountPaise,
        paidBy: body.paidBy,
        shares,
      },
    });
  });

  router.delete('/:groupId/expenses/:expenseId', async (req, res) => {
    const { groupId } = await loadGroupForMember(req);
    const expenseId = parse(id, req.params.expenseId);
    // Scoping the delete by group_id stops someone deleting another group's expense by id.
    const result = await db.query('DELETE FROM expenses WHERE id = $1 AND group_id = $2', [expenseId, groupId]);
    if (result.rowCount === 0) throw notFound('Expense not found');
    res.status(204).end();
  });

  router.get('/:groupId/balances', async (req, res) => {
    const { groupId, members } = await loadGroupForMember(req);
    // One statement = one consistent snapshot of expenses, shares and settlements.
    // net = paid − own shares + settlements sent − settlements received
    const { rows } = await db.query<{ userId: number; netPaise: number }>(
      `SELECT user_id AS "userId", SUM(delta)::bigint AS "netPaise" FROM (
         SELECT paid_by AS user_id, amount_paise AS delta FROM expenses WHERE group_id = $1
         UNION ALL SELECT user_id, -share_paise FROM expense_shares WHERE group_id = $1
         UNION ALL SELECT from_user, amount_paise FROM settlements WHERE group_id = $1
         UNION ALL SELECT to_user, -amount_paise FROM settlements WHERE group_id = $1
       ) t GROUP BY user_id`,
      [groupId],
    );
    const net = new Map(rows.map((r) => [r.userId, r.netPaise]));
    const balances = members.map((m) => ({ userId: m.id, name: m.name, netPaise: net.get(m.id) ?? 0 }));
    res.json({ balances, suggestedTransfers: simplifyDebts(balances) });
  });

  router.get('/:groupId/settlements', async (req, res) => {
    const { groupId } = await loadGroupForMember(req);
    const { rows } = await db.query(
      `SELECT id, from_user AS "fromUserId", to_user AS "toUserId", amount_paise AS "amountPaise",
              created_at AS "createdAt"
         FROM settlements WHERE group_id = $1
        ORDER BY created_at DESC, id DESC`,
      [groupId],
    );
    res.json({ settlements: rows });
  });

  router.post('/:groupId/settlements', async (req, res) => {
    const { groupId, members } = await loadGroupForMember(req);
    const body = parse(SettlementBody, req.body);
    assertMembers(members, [body.fromUserId, body.toUserId]);
    const { rows } = await db.query(
      `INSERT INTO settlements (group_id, from_user, to_user, amount_paise, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, from_user AS "fromUserId", to_user AS "toUserId", amount_paise AS "amountPaise",
                 created_at AS "createdAt"`,
      [groupId, body.fromUserId, body.toUserId, body.amountPaise, currentUserId(req)],
    );
    res.status(201).json({ settlement: rows[0] });
  });

  return router;
}
