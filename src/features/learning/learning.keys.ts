/**
 * Cache keys for the Learning surface.
 *
 * Nested per resource so a partial key clears everything beneath it —
 * invalidating `learningKeys.assignments.all` drops every filtered page, every
 * detail and each detail's submissions.
 *
 * Teaching and portal reads of the same record are DELIBERATELY separate keys.
 * They are not the same payload: `/teaching/…/submissions` returns every
 * learner's work with marks attached, while `/portal/assignments/{id}` returns
 * what one learner may see, with `score` nulled until the mark is released.
 * Sharing a key between them would serve a teacher's view to a learner the
 * first time the two screens met in one session.
 */
export const learningKeys = {
  assignments: {
    all: ['learning', 'assignments'] as const,
    list: (query?: unknown) => ['learning', 'assignments', 'list', query] as const,
    detail: (id: string) => ['learning', 'assignments', 'detail', id] as const,
    submissions: (id: string, query?: unknown) =>
      ['learning', 'assignments', 'detail', id, 'submissions', query] as const,
  },
  portal: {
    all: ['learning', 'portal'] as const,
    assignments: (query?: unknown) => ['learning', 'portal', 'assignments', query] as const,
    assignment: (id: string) => ['learning', 'portal', 'assignments', 'detail', id] as const,
    submissions: (id: string) =>
      ['learning', 'portal', 'assignments', 'detail', id, 'submissions'] as const,
  },
  forums: {
    all: ['learning', 'forums'] as const,
    teaching: () => ['learning', 'forums', 'teaching'] as const,
    portal: () => ['learning', 'forums', 'portal'] as const,
    detail: (id: string) => ['learning', 'forums', 'detail', id] as const,
    threads: (id: string, query?: unknown) =>
      ['learning', 'forums', 'detail', id, 'threads', query] as const,
    moderation: (id: string) => ['learning', 'forums', 'detail', id, 'moderation'] as const,
  },
  threads: {
    all: ['learning', 'threads'] as const,
    detail: (id: string) => ['learning', 'threads', 'detail', id] as const,
  },
} as const
