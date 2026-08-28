import { qk } from '@/shared/api/queryKeys'

/**
 * Cache keys for the Academics surface.
 *
 * ── Why these hang off `qk.academics` ──────────────────────────────────────
 *
 * Shared keys already own `qk.academics.sessions/periods/levels/learningGroups`
 * because Settings writes sessions and periods and the students filters read
 * levels and groups. Redeclaring them here would give the same data two cache
 * entries and two requests, and — worse — a write on one screen would leave the
 * other stale. So the four that already exist are re-exported rather than
 * re-invented, and only the branches shared keys do not name are added.
 *
 * Everything is nested under a single root per resource so a partial key clears
 * a resource and everything beneath it: invalidating `academicsKeys.offerings.all`
 * drops every filtered page, every detail, and each detail's instructors and
 * registrations, without naming them.
 */
export const academicsKeys = {
  sessions: {
    all: ['academics', 'sessions'] as const,
    list: (query?: unknown) => qk.academics.sessions(query),
    detail: (id: string) => ['academics', 'sessions', 'detail', id] as const,
  },
  periods: {
    all: ['academics', 'periods'] as const,
    list: (query?: unknown) => qk.academics.periods(query),
    detail: (id: string) => ['academics', 'periods', 'detail', id] as const,
  },
  levels: {
    all: ['academics', 'levels'] as const,
    list: (query?: unknown) => ['academics', 'levels', 'list', query] as const,
    tree: () => ['academics', 'levels', 'tree'] as const,
  },
  programs: {
    all: ['academics', 'programs'] as const,
    list: (query?: unknown) => ['academics', 'programs', 'list', query] as const,
    detail: (id: string) => ['academics', 'programs', 'detail', id] as const,
  },
  courses: {
    all: ['academics', 'courses'] as const,
    list: (query?: unknown) => ['academics', 'courses', 'list', query] as const,
    detail: (id: string) => ['academics', 'courses', 'detail', id] as const,
    curriculum: (id: string) => ['academics', 'courses', 'detail', id, 'curriculum'] as const,
  },
  groups: {
    all: ['academics', 'learning-groups'] as const,
    list: (query?: unknown) => qk.academics.learningGroups(query),
    detail: (id: string) => ['academics', 'learning-groups', 'detail', id] as const,
    members: (id: string, query?: unknown) =>
      ['academics', 'learning-groups', 'detail', id, 'members', query] as const,
  },
  offerings: {
    all: ['academics', 'offerings'] as const,
    list: (query?: unknown) => ['academics', 'offerings', 'list', query] as const,
    detail: (id: string) => ['academics', 'offerings', 'detail', id] as const,
    instructors: (id: string) => ['academics', 'offerings', 'detail', id, 'instructors'] as const,
    registrations: (id: string, query?: unknown) =>
      ['academics', 'offerings', 'detail', id, 'registrations', query] as const,
  },
  enrollments: {
    all: ['academics', 'enrollments'] as const,
    list: (query?: unknown) => ['academics', 'enrollments', 'list', query] as const,
    detail: (id: string) => ['academics', 'enrollments', 'detail', id] as const,
  },
  calendars: {
    all: ['academics', 'calendars'] as const,
    list: (query?: unknown) => ['academics', 'calendars', 'list', query] as const,
    detail: (id: string) => ['academics', 'calendars', 'detail', id] as const,
    entries: (id: string) => ['academics', 'calendars', 'detail', id, 'entries'] as const,
    instructionalDays: (id: string) =>
      ['academics', 'calendars', 'detail', id, 'instructional-days'] as const,
  },
  catalog: {
    all: ['academics', 'catalog'] as const,
    sessions: ['academics', 'catalog', 'sessions'] as const,
    periods: ['academics', 'catalog', 'periods'] as const,
    levels: ['academics', 'catalog', 'levels'] as const,
    programs: ['academics', 'catalog', 'programs'] as const,
    courses: ['academics', 'catalog', 'courses'] as const,
    groups: ['academics', 'catalog', 'groups'] as const,
    offerings: ['academics', 'catalog', 'offerings'] as const,
    units: ['academics', 'catalog', 'units'] as const,
    campuses: ['academics', 'catalog', 'campuses'] as const,
  },
} as const

/**
 * The keys a write on this surface has to clear, beyond its own resource.
 *
 * Almost everything academic is denormalised into rows elsewhere: a renamed
 * session appears as `academic_session_name` on every group, offering and
 * enrolment row, and as the caption in the rail. Invalidating only the list
 * that was written leaves those reading the old name until their own staleTime
 * expires, which is up to five minutes of two screens disagreeing.
 */
export const ACADEMIC_FANOUT = [
  academicsKeys.groups.all,
  academicsKeys.offerings.all,
  academicsKeys.enrollments.all,
  academicsKeys.catalog.all,
  qk.auth.context,
] as const
