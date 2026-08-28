/**
 * What each module is, and what the API already carries for it.
 *
 * ── Why this is static ─────────────────────────────────────────────────────
 *
 * `GET /portal/context` and `GET /portal/modules` return a module's id, name,
 * domain, enabled flag, deciding layer and capability list — but no prose and
 * no route inventory. Neither can be derived in the browser, so the two things
 * a reader of an unbuilt screen actually wants are compiled in here instead.
 *
 * ── Where the values come from ─────────────────────────────────────────────
 *
 * `summary` is one sentence per module, written from the registry's own
 * declarations in `slb/database/registry/modules.json` — the file
 * `App\Domain\Modules\Registry\ModuleRegistry` compiles and reads. It restates
 * the module's registered name and capability list; it does not describe
 * anything the registry has not declared. A module the registry does not
 * define has no entry here and the screen simply omits the line rather than
 * inventing one.
 *
 * `endpoints` and `paths` are counted from the API's own route table, keyed on
 * the `EnsureModuleEnabled:<module_id>` middleware every module-gated route
 * carries. So they name routes that genuinely exist and are genuinely gated on
 * this module — not a wish list. `paths` collapses `{id}` segments and keeps
 * the collection roots, relative to `/rest/v1`.
 *
 * An `endpoints: 0` entry is not an omission. It means the module is
 * registered and resolvable but has no HTTP surface yet, and saying so is the
 * whole point of the screen that renders this.
 *
 * ── Keeping it true ────────────────────────────────────────────────────────
 *
 * Regenerate against the backend when routes move. A stale path here is worse
 * than no path, because a reader will believe it.
 */

export interface ModuleCatalogEntry {
  /** One sentence, in the registry's own words. */
  summary: string
  /** How many HTTP routes the API gates behind this module id. */
  endpoints: number
  /** The collection roots those routes hang off, relative to `/rest/v1`. */
  paths: string[]
}

/** Keyed on `module_id` — snake_case, as the navigation tree and
 *  `access.modules` both spell it. Covers every module that appears in a
 *  navigation tree for any of the four portals, plus the tenant-facing ones an
 *  institution can switch off. Platform plumbing — queues, observability,
 *  billing — is deliberately absent: it is never somebody's destination. */
export const MODULE_CATALOG: Record<string, ModuleCatalogEntry> = {
  dashboard: {
    summary:
      'Role-aware overview figures for academics, finance, attendance and admissions, with alerts and quick actions.',
    endpoints: 2,
    paths: ['/admin/dashboard/metrics', '/admin/dashboard/summary'],
  },
  authentication: {
    summary:
      'User accounts, sign-in, sessions, password reset, verification, two-factor, device management and SSO.',
    endpoints: 0,
    paths: [],
  },
  people: {
    summary:
      'The person record behind every learner, guardian and staff member — profiles, addresses, contacts, identification and relationships.',
    endpoints: 0,
    paths: [],
  },
  rbac: {
    summary:
      'Roles and permissions, custom roles, and assignments scoped to a campus, department or course.',
    endpoints: 6,
    paths: ['/admin/permissions', '/admin/roles', '/admin/users'],
  },
  students: {
    summary:
      'Learner profiles, numbers, status, academic history, progression, transfers, withdrawals and alumni.',
    endpoints: 10,
    paths: ['/admin/students', '/portal/my-record'],
  },
  guardians: {
    summary:
      'Guardian profiles, guardian-to-learner relationships, pickup authorisation and financial responsibility.',
    endpoints: 5,
    paths: ['/admin/guardian-links', '/admin/guardians', '/admin/students'],
  },
  staff: {
    summary:
      'Staff profiles, employee numbers, positions, assignments, qualifications and employment history.',
    endpoints: 8,
    paths: ['/admin/staff', '/admin/staff-assignments', '/admin/staff-positions'],
  },
  hr: {
    summary:
      'Employment contracts, staff attendance, leave types, balances, requests and approvals, and performance reviews.',
    endpoints: 20,
    paths: ['/admin/employment-contracts', '/admin/leave-entitlements', '/admin/leave-requests', '/admin/leave-types', '/admin/performance-reviews', '/admin/staff-attendance', '/admin/staff-qualifications'],
  },
  payroll: {
    summary:
      'Salary structures and pay grades, payroll periods and runs, allowances, deductions, payslips and ledger posting.',
    endpoints: 19,
    paths: ['/admin/pay-grades', '/admin/payroll-components', '/admin/payroll-periods', '/admin/payroll-runs', '/admin/payslips', '/admin/salary-assignments', '/admin/statutory-rules'],
  },
  institution_structure: {
    summary:
      'Campuses, buildings and rooms, and the faculty, department and unit hierarchy above them.',
    endpoints: 12,
    paths: ['/admin/buildings', '/admin/campuses', '/admin/organizational-units', '/admin/rooms'],
  },
  academic_sessions: {
    summary:
      'Sessions, their dates and status, and the admission and registration windows inside them.',
    endpoints: 8,
    paths: ['/admin/academic-sessions'],
  },
  academic_periods: {
    summary:
      'The divisions of a session — terms, semesters, quarters, blocks — and their assessment and publication windows.',
    endpoints: 4,
    paths: ['/admin/academic-periods', '/admin/academic-sessions'],
  },
  academic_calendar: {
    summary:
      'Academic events, holidays and the dated milestones of a session.',
    endpoints: 6,
    paths: ['/admin/academic-calendars'],
  },
  academic_levels: {
    summary:
      'Grades, levels and stages, and the order learners are promoted through them.',
    endpoints: 6,
    paths: ['/admin/academic-levels'],
  },
  programs: {
    summary:
      'Programmes, degrees, diplomas and certifications, with their duration, requirements and outcomes.',
    endpoints: 3,
    paths: ['/admin/programs'],
  },
  curriculum: {
    summary:
      'Curricula and their versions, the courses and requirements each one carries, and the history of changes.',
    endpoints: 16,
    paths: ['/admin/courses', '/admin/curricula', '/admin/scheme-modules', '/admin/scheme-topics'],
  },
  courses: {
    summary:
      'Courses and subjects, their categories, credit units, contact hours, prerequisites and outcomes.',
    endpoints: 3,
    paths: ['/admin/courses'],
  },
  learning_groups: {
    summary:
      'Classes, cohorts, sections and tutorial groups, their memberships and their assigned staff.',
    endpoints: 11,
    paths: ['/admin/learning-groups'],
  },
  course_offerings: {
    summary:
      'A course as actually taught in one session — instructor, campus, delivery mode and capacity.',
    endpoints: 7,
    paths: ['/admin/course-offerings', '/admin/learning-groups'],
  },
  enrollment: {
    summary:
      'Enrollment into a session, period, programme, class or cohort, and the history of every change.',
    endpoints: 8,
    paths: ['/admin/academic-sessions', '/admin/course-offerings', '/admin/enrollments', '/admin/learning-groups'],
  },
  course_registration: {
    summary:
      'Course registration with add, drop and withdrawal, registration windows and rules, prerequisite validation, carryover courses and electives.',
    endpoints: 0,
    paths: [],
  },
  admissions: {
    summary:
      'Admission cycles, applicants, applications, requirements, reviews, interviews, decisions and offers.',
    endpoints: 24,
    paths: ['/admin/admissions/applicants', '/admin/admissions/applications', '/admin/admissions/cycles'],
  },
  crm: {
    summary:
      'Recruitment leads, their sources and assignment, follow-ups, campaigns and conversion tracking.',
    endpoints: 0,
    paths: [],
  },
  lms: {
    summary:
      'Learning modules, lessons and resources, learning paths, release rules and content versioning.',
    endpoints: 0,
    paths: [],
  },
  learning_progress: {
    summary:
      'Lesson and module completion, course progress, bookmarks, notes and engagement tracking.',
    endpoints: 0,
    paths: [],
  },
  assignments: {
    summary:
      'Assignments and their resources, submissions, resubmission, rubrics, deadlines and feedback.',
    endpoints: 12,
    paths: ['/portal/assignments', '/teaching/assignments', '/teaching/offerings'],
  },
  discussions: {
    summary:
      'Forums, threads, posts, comments, reactions, attachments and subscriptions.',
    endpoints: 14,
    paths: ['/portal/discussions', '/teaching/forums', '/teaching/posts', '/teaching/threads'],
  },
  question_bank: {
    summary:
      'Question banks and their questions, versions, options, tags, outcomes and difficulty levels.',
    endpoints: 8,
    paths: ['/teaching/question-banks', '/teaching/questions'],
  },
  assessments: {
    summary:
      'Quizzes, tests, continuous assessment, examinations, practicals and projects, with their windows and accommodations.',
    endpoints: 0,
    paths: [],
  },
  cbt: {
    summary:
      'Timed online examinations — attempts, question pools and randomisation, attempt limits, auto-submission and proctoring.',
    endpoints: 18,
    paths: ['/portal/exam-attempts', '/portal/exams', '/teaching/exams', '/teaching/offerings'],
  },
  gradebook: {
    summary:
      'Gradebooks, grade categories and items, entries, weighting and calculated totals.',
    endpoints: 11,
    paths: ['/teaching/gradebooks'],
  },
  grading: {
    summary:
      'Grading schemes — letter grades, percentages, grade points, pass/fail and competency rules.',
    endpoints: 0,
    paths: [],
  },
  results: {
    summary:
      'Result processing, moderation, approval, publication and locking, and the grade-change workflow.',
    endpoints: 3,
    paths: ['/portal/results'],
  },
  report_cards: {
    summary:
      'Report cards carrying subject results, teacher and principal comments, skills and behaviour scores.',
    endpoints: 0,
    paths: [],
  },
  gpa_cgpa: {
    summary:
      'Period and session GPA, cumulative GPA, credit calculation, academic standing and degree classification.',
    endpoints: 0,
    paths: [],
  },
  transcripts: {
    summary:
      'Transcript generation from academic history, official transcripts, verification and exports.',
    endpoints: 7,
    paths: ['/admin/students', '/admin/transcripts', '/portal/transcripts'],
  },
  graduation: {
    summary:
      'Graduation audit — completion and credit-requirement validation, eligibility, degree awards and honours classification.',
    endpoints: 10,
    paths: ['/admin/graduation/candidacies', '/admin/programs', '/admin/students'],
  },
  attendance: {
    summary:
      'Learner and staff attendance by class, course and event, with late tracking, excuses and reporting.',
    endpoints: 11,
    paths: ['/portal/attendance', '/teaching/attendance/excuses', '/teaching/attendance/sessions'],
  },
  smart_attendance: {
    summary:
      'Attendance captured by QR code, biometrics, RFID or a connected device rather than by hand.',
    endpoints: 0,
    paths: [],
  },
  timetable: {
    summary:
      'Class, course, staff and room schedules, with conflict detection, availability rules and exceptions.',
    endpoints: 10,
    paths: ['/admin/room-bookings', '/admin/timetables', '/portal/timetable'],
  },
  finance: {
    summary:
      'Fees, invoices, payments, receipts, refunds, discounts, credit and debit notes, and learner balances.',
    endpoints: 32,
    paths: ['/admin/finance/fee-structures', '/admin/finance/invoices', '/admin/finance/payment-events', '/admin/finance/payment-plans', '/admin/finance/payments', '/admin/finance/scholarship-awards', '/admin/finance/students', '/admin/finance/summary', '/portal/finance/balance', '/portal/finance/invoices', '/portal/finance/payment-intents', '/portal/finance/payments'],
  },
  fee_management: {
    summary:
      'Fee categories, structures and items, and how they attach to a session, period, programme, class or learner.',
    endpoints: 0,
    paths: [],
  },
  payment_management: {
    summary:
      'Payment gateways and channels, allocation against invoices, verification and payment history.',
    endpoints: 0,
    paths: [],
  },
  scholarships: {
    summary:
      'Scholarships, sponsorships and financial aid, and the awards made from them.',
    endpoints: 0,
    paths: [],
  },
  payment_plans: {
    summary:
      'Instalments, due dates, payment schedules and partial payments.',
    endpoints: 0,
    paths: [],
  },
  accounting: {
    summary:
      'Chart of accounts, financial years, journal entries and lines, ledger balances and reconciliation.',
    endpoints: 0,
    paths: [],
  },
  communications: {
    summary:
      'Announcements, and direct, group, guardian, staff and learner messaging.',
    endpoints: 18,
    paths: ['/admin/communications/announcements', '/portal/announcements', '/portal/directory', '/portal/threads'],
  },
  notifications: {
    summary:
      'In-app, email, SMS, push and WhatsApp delivery, with per-person preferences and delivery tracking.',
    endpoints: 4,
    paths: ['/portal/notifications'],
  },
  calendar_events: {
    summary:
      'Events, meetings, seminars, workshops, deadlines and reminders.',
    endpoints: 3,
    paths: ['/admin/calendar/events', '/portal/calendar'],
  },
  document_management: {
    summary:
      'Documents and media with categories, versions, signed URLs and per-file permissions.',
    endpoints: 14,
    paths: ['/admin/document-folders', '/admin/documents', '/portal/documents'],
  },
  certificates: {
    summary:
      'Certificate templates, generation and issuance, QR and public verification, and revocation.',
    endpoints: 5,
    paths: ['/admin/certificates', '/portal/certificates'],
  },
  library: {
    summary:
      'Titles and copies, members, loans and returns, reservations and fines.',
    endpoints: 25,
    paths: ['/admin/library/copies', '/admin/library/fines', '/admin/library/loans', '/admin/library/members', '/admin/library/reservations', '/admin/library/titles', '/portal/library'],
  },
  hostel: {
    summary:
      'Hostels, blocks, rooms and beds, applications and allocations, hostel fees and incidents.',
    endpoints: 13,
    paths: ['/admin/hostel/allocations', '/admin/hostel/beds', '/admin/hostel/hostels', '/admin/hostel/occupancy', '/admin/hostel/rooms', '/portal/hostel/allocation'],
  },
  transport: {
    summary:
      'Vehicles, drivers, routes and stops, learner assignments, trips and rider check-in.',
    endpoints: 17,
    paths: ['/admin/transport/drivers', '/admin/transport/routes', '/admin/transport/subscriptions', '/admin/transport/trips', '/admin/transport/vehicles', '/portal/transport/route'],
  },
  assets_inventory: {
    summary:
      'Assets with their assignments and maintenance, plus inventory items, stock movements, suppliers and purchase orders.',
    endpoints: 18,
    paths: ['/admin/assets', '/admin/inventory/items', '/admin/inventory/movements', '/admin/inventory/stock'],
  },
  health_clinic: {
    summary:
      'Health profiles, allergies, conditions and immunisations, clinic visits, medications, incidents and referrals.',
    endpoints: 10,
    paths: ['/health/profiles', '/health/students', '/health/visits'],
  },
  discipline: {
    summary:
      'Behaviour records and incidents, investigations, sanctions and their approval, appeals and commendations.',
    endpoints: 13,
    paths: ['/discipline/appeals', '/discipline/incidents', '/discipline/sanctions', '/discipline/students'],
  },
  counselling: {
    summary:
      'Counselling referrals and cases, care plans, sessions, restricted notes and case closure.',
    endpoints: 11,
    paths: ['/counselling/cases', '/counselling/grants', '/counselling/referrals', '/counselling/sessions'],
  },
  workflow: {
    summary:
      'Workflow definitions, steps and instances, and the approval chains behind leave, refunds, grade changes and discounts.',
    endpoints: 6,
    paths: ['/admin/approval-chains', '/admin/approvals'],
  },
  customization: {
    summary:
      'Custom fields and their values, tags, internal notes and comments on any record.',
    endpoints: 4,
    paths: ['/admin/custom-fields', '/admin/records'],
  },
  reports: {
    summary:
      'Academic, attendance, finance, admissions, enrollment and staff reporting, saved reports and scheduled runs.',
    endpoints: 8,
    paths: ['/admin/report-runs', '/admin/report-schedules', '/admin/reports'],
  },
  import_export: {
    summary:
      'CSV and XLSX import with validation, dry runs and duplicate detection, plus CSV, XLSX and PDF export.',
    endpoints: 7,
    paths: ['/admin/exports', '/admin/imports'],
  },
  integrations: {
    summary:
      'Payment, email, SMS and WhatsApp providers, Google Workspace, Microsoft 365, Zoom, biometric devices, and API clients and keys.',
    endpoints: 5,
    paths: ['/admin/integrations/connections', '/admin/integrations/syncs'],
  },
  audit_security: {
    summary:
      'Audit logs of user activity, data, grade, finance and permission changes, security events and data access.',
    endpoints: 0,
    paths: [],
  },
  privacy: {
    summary:
      'Consent records, privacy requests, data export and deletion requests, retention policies and anonymisation.',
    endpoints: 12,
    paths: ['/admin/privacy/consents', '/admin/privacy/erasure-policy', '/admin/privacy/requests', '/admin/privacy/retention-policies'],
  },
  helpdesk: {
    summary:
      'Support tickets with categories, messages, assignment and status tracking.',
    endpoints: 11,
    paths: ['/admin/helpdesk/queues', '/admin/helpdesk/tickets'],
  },
  ai_platform: {
    summary:
      'AI agents, models and prompts with versioning, run and message history, tool calls, and usage and cost tracking.',
    endpoints: 6,
    paths: ['/admin/ai/budgets', '/admin/ai/models', '/admin/ai/providers'],
  },
  ai_tutor: {
    summary:
      'Course-aware chat for learners — question explanation, revision support and personalised recommendations.',
    endpoints: 0,
    paths: [],
  },
  ai_teacher: {
    summary:
      'Generation of lessons, quizzes, questions, rubrics, summaries and revision material for teaching staff.',
    endpoints: 0,
    paths: [],
  },
  ai_grading: {
    summary:
      'Suggested scores and feedback against a rubric, held for human approval before anything is recorded.',
    endpoints: 0,
    paths: [],
  },
  ai_student_success: {
    summary:
      'Attendance, academic and engagement risk signals, with explainable factors and intervention suggestions.',
    endpoints: 3,
    paths: ['/admin/ai/risk-signals'],
  },
  ai_admissions: {
    summary:
      'Applicant questions, application summaries, requirement checking, document summarisation and review assistance.',
    endpoints: 0,
    paths: [],
  },
  ai_admin_copilot: {
    summary:
      'Plain-language questions about fees, attendance, enrollment, admissions and staff, answered from the institution’s own data.',
    endpoints: 0,
    paths: [],
  },
  ai_parent: {
    summary:
      'Answers for guardians about their children’s performance, attendance and fees, within what they are authorised to see.',
    endpoints: 0,
    paths: [],
  },
  ai_rag: {
    summary:
      'Knowledge bases and sources, chunking and embeddings, and tenant-isolated semantic search over them.',
    endpoints: 6,
    paths: ['/admin/ai/knowledge/bases', '/admin/ai/knowledge/documents', '/admin/ai/knowledge/search'],
  },
  ai_governance: {
    summary:
      'Guardrails, human approval, PII redaction, provider controls, cost limits and an audit of every AI run.',
    endpoints: 2,
    paths: ['/admin/ai/policy', '/admin/ai/runs'],
  },
  search: {
    summary:
      'Global full-text and semantic search across learners, staff and courses.',
    endpoints: 1,
    paths: ['/search'],
  },
}

/** The entry for a module, or null when the registry does not define one.
 *  Null is a real answer: the screen omits the description rather than
 *  guessing at what an unknown module does. */
export function moduleCatalogEntry(
  moduleId: string | null | undefined,
): ModuleCatalogEntry | null {
  if (!moduleId) return null
  return MODULE_CATALOG[moduleId] ?? null
}

/** The route segment `/$module` carries is kebab-cased by the API; module ids
 *  are snake_case. `academic-sessions` and `academic_sessions` are the same
 *  module. */
export function moduleIdFromSegment(segment: string): string {
  return segment.replace(/-/g, '_')
}
