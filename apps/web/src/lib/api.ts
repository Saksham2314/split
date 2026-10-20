// Thin typed wrapper around fetch for the SplitSmart API.
// Requests are same-origin (/api/...), so the browser attaches the HttpOnly session cookie itself;
// this code never sees or stores the token.

export interface User {
  id: number;
  name: string;
  email: string;
}
export interface GroupSummary {
  id: number;
  name: string;
  createdAt: string;
  memberCount: number;
}
export interface GroupDetail {
  id: number;
  name: string;
  createdAt: string;
  members: User[];
}
export interface Expense {
  id: number;
  description: string;
  amountPaise: number;
  paidBy: number;
  spentOn: string;
  createdAt: string;
  shares: { userId: number; sharePaise: number }[];
}
export interface Settlement {
  id: number;
  fromUserId: number;
  toUserId: number;
  amountPaise: number;
  createdAt: string;
}
export interface Transfer {
  fromUserId: number;
  toUserId: number;
  amountPaise: number;
}
export interface Balances {
  balances: { userId: number; name: string; netPaise: number }[];
  suggestedTransfers: Transfer[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const details = data?.error?.details as { message: string }[] | undefined;
    const message = details?.length ? details.map((d) => d.message).join('; ') : data?.error?.message;
    throw new ApiError(res.status, message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User }>('GET', '/auth/me'),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>('POST', '/auth/register', { name, email, password }),
  login: (email: string, password: string) => request<{ user: User }>('POST', '/auth/login', { email, password }),
  logout: () => request<void>('POST', '/auth/logout'),
  providers: () => request<{ google: boolean }>('GET', '/auth/providers'),

  listGroups: () => request<{ groups: GroupSummary[] }>('GET', '/groups'),
  createGroup: (name: string) =>
    request<{ group: Omit<GroupSummary, 'memberCount'> }>('POST', '/groups', { name }),
  getGroup: (id: number) => request<{ group: GroupDetail }>('GET', `/groups/${id}`),
  addMember: (id: number, email: string) => request<{ member: User }>('POST', `/groups/${id}/members`, { email }),

  listExpenses: (id: number) => request<{ expenses: Expense[] }>('GET', `/groups/${id}/expenses`),
  addExpense: (
    id: number,
    expense: { description: string; amountPaise: number; paidBy: number; participantIds: number[]; spentOn: string },
  ) => request<{ expense: Expense }>('POST', `/groups/${id}/expenses`, expense),
  deleteExpense: (id: number, expenseId: number) => request<void>('DELETE', `/groups/${id}/expenses/${expenseId}`),

  balances: (id: number) => request<Balances>('GET', `/groups/${id}/balances`),
  listSettlements: (id: number) => request<{ settlements: Settlement[] }>('GET', `/groups/${id}/settlements`),
  addSettlement: (id: number, transfer: Transfer) =>
    request<{ settlement: Settlement }>('POST', `/groups/${id}/settlements`, transfer),
};
