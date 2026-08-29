/**
 * Cache keys for attendance.
 *
 * A register and a group's history are separate reads of the same underlying
 * marks, so writing a mark has to clear both — `attendanceKeys.all` is the
 * root every mutation invalidates, and the branches below hang off it so a
 * partial key does that in one call.
 */
export const attendanceKeys = {
  all: ['attendance'] as const,
  register: (sessionId: string) => ['attendance', 'register', sessionId] as const,
  groupHistory: (groupId: string, query?: unknown) =>
    ['attendance', 'group', groupId, query] as const,
  excuses: (query?: unknown) => ['attendance', 'excuses', query] as const,
  portal: {
    all: ['attendance', 'portal'] as const,
    summary: (query?: unknown) => ['attendance', 'portal', 'summary', query] as const,
    records: (query?: unknown) => ['attendance', 'portal', 'records', query] as const,
  },
} as const
