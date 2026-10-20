import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, registerUser, type TestUser } from './helpers.js';

afterAll(() => db.end());

describe('groups, expenses, balances and settlements', () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let mallory: TestUser; // never joins the group
  let groupId: number;

  beforeAll(async () => {
    alice = await registerUser('Alice');
    bob = await registerUser('Bob');
    carol = await registerUser('Carol');
    mallory = await registerUser('Mallory');
    const res = await alice.agent.post('/api/groups').send({ name: 'Goa trip' });
    expect(res.status).toBe(201);
    groupId = res.body.group.id;
  });

  it('adds members by email and lists the group for each member', async () => {
    for (const member of [bob, carol]) {
      const res = await alice.agent.post(`/api/groups/${groupId}/members`).send({ email: member.email.toUpperCase() });
      expect(res.status).toBe(201);
    }
    const dup = await alice.agent.post(`/api/groups/${groupId}/members`).send({ email: bob.email });
    expect(dup.status).toBe(409);
    const unknown = await alice.agent.post(`/api/groups/${groupId}/members`).send({ email: 'nobody@example.com' });
    expect(unknown.status).toBe(404);

    const list = await bob.agent.get('/api/groups');
    expect(list.body.groups).toEqual([expect.objectContaining({ id: groupId, name: 'Goa trip', memberCount: 3 })]);
    const detail = await carol.agent.get(`/api/groups/${groupId}`);
    expect(detail.body.group.members.map((m: { id: number }) => m.id)).toEqual([alice.id, bob.id, carol.id]);
  });

  it('hides the group from non-members (404, not 403) on every route', async () => {
    expect((await mallory.agent.get('/api/groups')).body.groups).toEqual([]);
    const attempts = [
      mallory.agent.get(`/api/groups/${groupId}`),
      mallory.agent.get(`/api/groups/${groupId}/expenses`),
      mallory.agent.get(`/api/groups/${groupId}/balances`),
      mallory.agent.get(`/api/groups/${groupId}/settlements`),
      mallory.agent.post(`/api/groups/${groupId}/members`).send({ email: mallory.email }),
      mallory.agent
        .post(`/api/groups/${groupId}/expenses`)
        .send({ description: 'x', amountPaise: 100, paidBy: mallory.id, participantIds: [mallory.id] }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);
  });

  it('records an equal-split expense with exact paise shares', async () => {
    const res = await alice.agent.post(`/api/groups/${groupId}/expenses`).send({
      description: 'Dinner',
      amountPaise: 100_000, // ₹1000.00 / 3
      paidBy: alice.id,
      participantIds: [alice.id, bob.id, carol.id],
      spentOn: '2026-10-01',
    });
    expect(res.status).toBe(201);
    const shares = res.body.expense.shares.map((s: { sharePaise: number }) => s.sharePaise);
    expect(shares).toEqual([33_334, 33_333, 33_333]);
    expect(res.body.expense.spentOn).toBe('2026-10-01');
  });

  it('rejects invalid expenses', async () => {
    const url = `/api/groups/${groupId}/expenses`;
    const base = { description: 'Taxi', amountPaise: 500, paidBy: bob.id, participantIds: [bob.id] };
    const bad = [
      { ...base, amountPaise: 12.5 }, // fractional paise
      { ...base, amountPaise: -100 },
      { ...base, participantIds: [] },
      { ...base, paidBy: mallory.id }, // payer not in group
      { ...base, participantIds: [bob.id, mallory.id] }, // participant not in group
      { ...base, description: '' },
    ];
    for (const body of bad) expect((await bob.agent.post(url).send(body)).status).toBe(400);
  });

  it('computes balances and a settlement plan that zeroes everyone out', async () => {
    await bob.agent.post(`/api/groups/${groupId}/expenses`).send({
      description: 'Taxi',
      amountPaise: 30_000,
      paidBy: bob.id,
      participantIds: [bob.id, carol.id],
    });
    // Alice: +100000 − 33334 = +66666; Bob: +30000 − 33333 − 15000 = −18333; Carol: −33333 − 15000 = −48333
    const res = await carol.agent.get(`/api/groups/${groupId}/balances`);
    expect(res.status).toBe(200);
    const net = Object.fromEntries(res.body.balances.map((b: { userId: number; netPaise: number }) => [b.userId, b.netPaise]));
    expect(net).toEqual({ [alice.id]: 66_666, [bob.id]: -18_333, [carol.id]: -48_333 });
    expect(res.body.suggestedTransfers).toEqual([
      { fromUserId: carol.id, toUserId: alice.id, amountPaise: 48_333 },
      { fromUserId: bob.id, toUserId: alice.id, amountPaise: 18_333 },
    ]);
  });

  it('records settlements, which update balances', async () => {
    const url = `/api/groups/${groupId}/settlements`;
    expect((await carol.agent.post(url).send({ fromUserId: carol.id, toUserId: carol.id, amountPaise: 1 })).status).toBe(400);
    expect((await carol.agent.post(url).send({ fromUserId: carol.id, toUserId: mallory.id, amountPaise: 1 })).status).toBe(400);

    const res = await carol.agent.post(url).send({ fromUserId: carol.id, toUserId: alice.id, amountPaise: 48_333 });
    expect(res.status).toBe(201);

    const balances = await alice.agent.get(`/api/groups/${groupId}/balances`);
    expect(balances.body.suggestedTransfers).toEqual([{ fromUserId: bob.id, toUserId: alice.id, amountPaise: 18_333 }]);
    const history = await bob.agent.get(url);
    expect(history.body.settlements).toHaveLength(1);
  });

  it('lists expense history newest first and deletes expenses only within the group', async () => {
    const list = await bob.agent.get(`/api/groups/${groupId}/expenses`);
    expect(list.body.expenses.map((e: { description: string }) => e.description)).toEqual(['Taxi', 'Dinner']);

    // Mallory's own group: she must not be able to delete Alice's expense through it.
    const own = await mallory.agent.post('/api/groups').send({ name: 'Mallory solo' });
    const taxiId = list.body.expenses[0].id;
    expect((await mallory.agent.delete(`/api/groups/${own.body.group.id}/expenses/${taxiId}`)).status).toBe(404);

    expect((await bob.agent.delete(`/api/groups/${groupId}/expenses/${taxiId}`)).status).toBe(204);
    const after = await bob.agent.get(`/api/groups/${groupId}/expenses`);
    expect(after.body.expenses).toHaveLength(1);
  });

  it('returns 400 for a non-numeric group id and 404 for unknown API routes', async () => {
    expect((await alice.agent.get('/api/groups/abc')).status).toBe(400);
    expect((await alice.agent.get('/api/does-not-exist')).status).toBe(404);
  });
});
