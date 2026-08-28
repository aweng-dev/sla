import { useMemo } from 'react'
import { useTerminology } from '@/features/tenant/TenantProvider'
import type { TerminologyKey } from '@/shared/types/tenant.types'

/**
 * Module id to the word the RAIL uses for it.
 *
 * ── Why the API's label cannot be the rail's label ─────────────────────────
 *
 * `GET /portal/context` sends each item's `label` straight from the module
 * registry, and the registry's names are catalogue names — written to be
 * unambiguous in a list of eighty-five modules, one per line, with room to
 * breathe. They read as "Classes, Cohorts and Learning Groups", "Parent and
 * Guardian Management", "Custom Fields, Tags, Notes and Comments".
 *
 * Correct there. Wrong in a 240px rail, where roughly thirty characters fit
 * before the ellipsis and an administrator's tree is nineteen sections deep:
 * three of those truncate to "Classes, Cohorts and…", "Parent and Guardian…",
 * "Custom Fields, Tags,…", and the reader is scanning prefixes rather than
 * names. This is the destination's NAME — one or two words, the noun somebody
 * would say out loud — while the registry keeps the full description for the
 * module screen, which has the width for it.
 *
 * The map is not a translation of the registry name. `communications` is
 * "Messages" because that is what a person opens it for; `lms` is "Lessons",
 * not "Learning", because the section it sits under is already called
 * Learning and a heading repeated as its own child says nothing.
 *
 * ── Institution type decides the noun, and it already does everywhere else ──
 *
 * A school's `learning_groups` is Classes; a university's is Cohorts; a
 * training provider's is Cohorts too. Its `courses` are Subjects, Modules and
 * Courses respectively. None of that is a translation table this file gets to
 * invent — `tenant.terminology` carries the institution's own words, resolved
 * server-side by `ResolveInstitutionTerminology` from the type's vocabulary,
 * and every other screen in the product already renders through it. So the
 * entries that name a domain concept are FUNCTIONS of that vocabulary rather
 * than strings, and the rail says Delegates to a training provider for exactly
 * the same reason the learner screens do.
 *
 * The entries that are plain strings are the ones where the concept does not
 * change with the institution: Fees are fees, a timetable is a timetable.
 *
 * ── The fallback is not a bug ──────────────────────────────────────────────
 *
 * A module the API adds tomorrow has no entry here and gets `shorten()` — the
 * same property `moduleIcons` has with its `SquaresFour`. The rail is
 * server-driven precisely so an institution's module set can change without a
 * frontend deploy, and a label map that fell back to nothing would take that
 * away.
 */

type Vocabulary = (key: TerminologyKey, fallback?: string) => string

/** A fixed word, or one built from the institution's own vocabulary. */
type LabelSpec = string | ((t: Vocabulary) => string)

const MODULE_LABELS: Record<string, LabelSpec> = {
  // Platform
  dashboard: 'Dashboard',
  multi_tenancy: 'Tenancy',
  observability: 'Observability',
  localization: 'Localization',
  white_label: 'White label',
  saas_billing: 'Billing',

  // Identity
  authentication: 'Sign-in',
  rbac: 'Roles',

  // People
  people: 'People',
  students: (t) => t('learners'),
  guardians: (t) => t('guardians'),
  staff: 'Staff',
  hr: 'HR',
  payroll: 'Payroll',

  // Academics
  institution_structure: 'Structure',
  academic_sessions: (t) => t('sessions'),
  academic_periods: (t) => t('periods'),
  academic_calendar: 'Calendar',
  academic_levels: (t) => t('levels'),
  programs: (t) => t('programmes'),
  curriculum: 'Curriculum',
  courses: (t) => t('courses'),
  learning_groups: (t) => t('groups'),
  course_offerings: (t) => `${t('course')} offerings`,
  enrollment: (t) => t('enrolment'),
  /* Distinct from `enrollment`, which is joining the institution. Both can sit
   * in one Academics section, and for a university both would otherwise read
   * "Registration". */
  course_registration: (t) => `${t('course')} registration`,
  certificates: 'Certificates',

  // Admissions
  admissions: 'Admissions',
  crm: 'Recruitment',

  // Learning
  lms: 'Lessons',
  learning_progress: 'Progress',
  assignments: 'Assignments',
  discussions: 'Discussions',

  // Assessment
  question_bank: 'Question bank',
  assessments: (t) => t('assessments'),
  cbt: 'Online tests',
  gradebook: 'Gradebook',
  grading: 'Grading',
  results: 'Results',
  report_cards: 'Report cards',
  gpa_cgpa: 'GPA and CGPA',
  transcripts: 'Transcripts',
  graduation: 'Graduation',

  // Attendance
  /* A school marks a Register; a university and a provider record Attendance.
   * The vocabulary already draws that line. */
  attendance: (t) => t('register'),
  smart_attendance: 'Smart attendance',

  // Scheduling
  timetable: 'Timetable',

  // Finance
  finance: (t) => `${t('learner')} finance`,
  fee_management: 'Fees',
  payment_management: 'Payments',
  scholarships: 'Scholarships',
  payment_plans: 'Payment plans',
  accounting: 'Accounting',

  // Communication
  communications: 'Messages',
  notifications: 'Notifications',
  calendar_events: 'Events',

  // Operations
  library: 'Library',
  hostel: 'Hostel',
  transport: 'Transport',
  assets_inventory: 'Assets',

  // Student services
  health_clinic: 'Clinic',
  discipline: 'Discipline',
  counselling: 'Counselling',

  // Analytics
  reports: 'Reports',

  // Platform services
  document_management: 'Documents',
  workflow: 'Workflows',
  customization: 'Custom fields',
  import_export: 'Import and export',
  integrations: 'Integrations',
  webhooks: 'Webhooks',
  search: 'Search',
  realtime: 'Realtime',
  background_processing: 'Background jobs',

  // Security
  audit_security: 'Audit log',
  privacy: 'Privacy',

  // Support
  helpdesk: 'Help desk',

  // AI
  ai_platform: 'AI platform',
  ai_tutor: 'AI tutor',
  ai_teacher: 'AI teacher',
  ai_grading: 'AI grading',
  ai_student_success: (t) => `${t('learner')} success`,
  ai_admissions: 'AI admissions',
  ai_admin_copilot: 'AI copilot',
  ai_parent: (t) => `AI ${t('guardian').toLowerCase()}`,
  ai_rag: 'Knowledge base',
  ai_governance: 'AI governance',

  // Portal-side extras
  archive: 'Archive',
}

/**
 * Section headings.
 *
 * `BuildUserNavigation` already writes these short — Platform, Students,
 * Academics — so this exists for the one thing it cannot know: a heading that
 * names a domain concept has to speak the institution's vocabulary too, or a
 * training provider reads "Delegates" under a heading that says Students.
 */
const SECTION_LABELS: Record<string, LabelSpec> = {
  students: (t) => t('learners'),
}

/**
 * What to call a module this build has never heard of.
 *
 * Registry names are built the same way every time, so the trims are the
 * inverse of that construction rather than guesses: the list before the first
 * comma, the clause before the first "and", and the trailing noun that says
 * "this is a module" rather than saying what it is.
 *
 *     Classes, Cohorts and Learning Groups → Classes
 *     Hostel and Accommodation             → Hostel
 *     Programme Management                 → Programme
 *
 * It never returns empty: a label it cannot shorten comes back whole, and the
 * rail truncates it as it always did.
 */
export function shorten(label: string): string {
  let short = label.trim()

  const comma = short.indexOf(',')
  if (comma > 0) short = short.slice(0, comma)

  const conjunction = short.search(/\s+and\s+/i)
  if (conjunction > 0) short = short.slice(0, conjunction)

  short = short.replace(/\s+(Management|System|Services)$/i, '').trim()

  return short || label.trim()
}

function resolve(spec: LabelSpec | undefined, fallback: string, t: Vocabulary): string {
  if (typeof spec === 'string') return spec
  if (spec) return spec(t)
  return shorten(fallback)
}

export interface NavLabels {
  /** The rail's word for one module row or quick action. */
  item: (item: { key: string; label: string }) => string
  /** The rail's word for one section heading. */
  section: (section: { key: string; label: string }) => string
}

/**
 * Resolved once per vocabulary rather than per row — an administrator's rail is
 * sixty of these, and they all read the same map.
 */
export function useNavLabels(): NavLabels {
  const t = useTerminology()

  return useMemo(
    () => ({
      item: (item) => resolve(MODULE_LABELS[item.key], item.label, t),
      section: (section) => resolve(SECTION_LABELS[section.key], section.label, t),
    }),
    [t],
  )
}
