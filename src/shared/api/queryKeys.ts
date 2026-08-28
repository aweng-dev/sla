/**
 * Every cache key in one place.
 *
 * Keys are hierarchical so a partial key invalidates everything beneath it:
 * `invalidateQueries({ queryKey: qk.students.all })` clears the list, every
 * filtered page of it and every detail, without naming them.
 */
export const qk = {
  tenant: {
    context: ['tenant', 'context'] as const,
  },
  auth: {
    me: ['auth', 'me'] as const,
    context: ['auth', 'context'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => ['dashboard', 'summary'] as const,
    metric: (metric: string, params?: unknown) => ['dashboard', 'metric', metric, params] as const,
  },
  students: {
    all: ['students'] as const,
    list: (params?: unknown) => ['students', 'list', params] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
    statistics: () => ['students', 'statistics'] as const,
  },
  staff: {
    all: ['staff'] as const,
    list: (params?: unknown) => ['staff', 'list', params] as const,
    detail: (id: string) => ['staff', 'detail', id] as const,
  },
  guardians: {
    all: ['guardians'] as const,
    list: (params?: unknown) => ['guardians', 'list', params] as const,
    detail: (id: string) => ['guardians', 'detail', id] as const,
  },
  finance: {
    all: ['finance'] as const,
    summary: (params?: unknown) => ['finance', 'summary', params] as const,
    invoices: (params?: unknown) => ['finance', 'invoices', params] as const,
    balance: () => ['finance', 'balance'] as const,
  },
  academics: {
    sessions: (params?: unknown) => ['academics', 'sessions', params] as const,
    periods: (params?: unknown) => ['academics', 'periods', params] as const,
    levels: () => ['academics', 'levels'] as const,
    learningGroups: (params?: unknown) => ['academics', 'learning-groups', params] as const,
  },
  portal: {
    all: ['portal'] as const,
    myRecord: () => ['portal', 'my-record'] as const,
    results: (params?: unknown) => ['portal', 'results', params] as const,
    timetable: (params?: unknown) => ['portal', 'timetable', params] as const,
    attendance: (params?: unknown) => ['portal', 'attendance', params] as const,
    assignments: (params?: unknown) => ['portal', 'assignments', params] as const,
    announcements: (params?: unknown) => ['portal', 'announcements', params] as const,
    notifications: (params?: unknown) => ['portal', 'notifications', params] as const,
    invoices: (params?: unknown) => ['portal', 'invoices', params] as const,
    balance: () => ['portal', 'balance'] as const,
    calendar: (params?: unknown) => ['portal', 'calendar', params] as const,
  },
  account: {
    self: ['account', 'self'] as const,
    avatar: ['account', 'avatar'] as const,
  },
} as const
