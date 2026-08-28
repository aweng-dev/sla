import { get, getPage } from '@/shared/api/client'
import type {
  AttendanceExcuseRow,
  CollectionSummary,
  CourseOfferingRow,
  DashboardSummary,
  GradebookRow,
  PortalAnnouncement,
  PortalAssignment,
  PortalAttendance,
  PortalBalance,
  PortalRecord,
  PortalResult,
  StudentStatistics,
  TimetableView,
} from './dashboard.types'

/**
 * Cache keys this screen needs that `qk` does not already name.
 *
 * They are shaped to nest under the branches `qk` already owns — a child's
 * balance lives at `['portal', 'balance', studentId]` — so invalidating
 * `qk.portal.all` still clears them. Kept here rather than added to
 * `shared/api/queryKeys` because only this feature reads them.
 */
export const dashboardKeys = {
  offeringsForStaff: (staffId: string) => ['teaching', 'course-offerings', staffId] as const,
  gradebooks: () => ['teaching', 'gradebooks'] as const,
  excuses: (status: string) => ['teaching', 'attendance-excuses', status] as const,
  childBalance: (studentId: string) => ['portal', 'balance', studentId] as const,
  childAttendance: (studentId: string) => ['portal', 'attendance', studentId] as const,
}

export const dashboardApi = {
  /* ── Administrator ─────────────────────────────────────────────────────── */

  summary: () => get<DashboardSummary>('/admin/dashboard/summary'),

  studentStatistics: () => get<StudentStatistics>('/admin/students/statistics'),

  /** Month granularity over a year of the ledger. The endpoint defaults to the
   *  last thirty days at day granularity, which for an institution that bills
   *  termly is a month of zeroes and says nothing about collection. */
  collections: (from: string, to: string) =>
    get<CollectionSummary>('/admin/finance/summary', {
      params: { from, to, granularity: 'month' },
    }),

  /* ── Teaching staff ────────────────────────────────────────────────────── */

  /** `?staff_id=` narrows to the offerings this person instructs. Without it
   *  the listing is the whole reader scope, which for a form tutor is every
   *  offering in their campus — not "what I teach". */
  offeringsForStaff: (staffId: string) =>
    getPage<CourseOfferingRow>('/admin/course-offerings', {
      params: { staff_id: staffId, per_page: 50 },
    }),

  gradebooks: () => getPage<GradebookRow>('/teaching/gradebooks', { params: { per_page: 50 } }),

  excuses: (status: string) =>
    get<AttendanceExcuseRow[]>('/teaching/attendance/excuses', { params: { status } }),

  /* ── Learner and guardian ──────────────────────────────────────────────── */

  /** An ARRAY. A guardian gets one record per child, a learner exactly one. */
  myRecord: () => get<PortalRecord[]>('/portal/my-record'),

  /** `student_id` is how a guardian names a child. The API intersects it with
   *  the children they are authorized for, so it narrows and never reaches. */
  balance: (studentId?: string) =>
    get<PortalBalance>('/portal/finance/balance', {
      params: studentId ? { student_id: studentId } : undefined,
    }),

  attendance: (studentId?: string) =>
    get<PortalAttendance[]>('/portal/attendance', {
      params: studentId ? { student_id: studentId } : undefined,
    }),

  /** `on` is an ISO date in the institution's own timezone — a day sheet asked
   *  for in the reader's browser timezone is the wrong day either side of
   *  midnight. */
  timetable: (on: string, studentId?: string) =>
    get<TimetableView>('/portal/timetable', {
      params: { on, ...(studentId ? { student_id: studentId } : {}) },
    }),

  results: () => get<PortalResult[]>('/portal/results'),

  assignments: () => getPage<PortalAssignment>('/portal/assignments', { params: { per_page: 5 } }),

  /** Cached under `qk.portal.announcements()` — the shared key, not a local
   *  array. The notices panel here and the Notifications screen read the same
   *  endpoint, and two spellings of the key would fetch it twice and hold two
   *  copies of it. `qk` is the one place that names it. */
  announcements: () => get<PortalAnnouncement[]>('/portal/announcements'),
}
