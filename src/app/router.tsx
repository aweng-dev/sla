import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { AppShell } from '@/shared/layout/AppShell'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { LoginPage } from '@/features/auth/LoginPage'
import { NotFoundPage } from '@/features/modules/NotFoundPage'

/*
 * ── What is eager and what is not ─────────────────────────────────────────
 *
 * `LoginPage` and `NotFoundPage` are imported directly: one is the first thing
 * an unauthenticated visitor sees and the other has to render when nothing
 * else could. Splitting either would put a network round trip in front of the
 * screen whose job is to appear immediately.
 *
 * Everything else is `lazyRouteComponent`, which matters most for the
 * dashboards — they pull Recharts, ~400 kB of the bundle, that a roster or an
 * account screen has no use for. `defaultPreload: 'intent'` fetches the chunk
 * on hover, so the split is invisible in practice.
 */

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
})

/* ── Public ──────────────────────────────────────────────────────────────── */

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
})

/* ── Everything behind the gate ──────────────────────────────────────────── */

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: () => (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  ),
})

/* `/` is not a screen. The API decides where a person lands — `default_route`
 * is the first real item of their first section — so a student and a bursar
 * open on different things without the client knowing which. */
const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' })
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/dashboard',
  component: lazyRouteComponent(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
})

const studentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/students',
  component: lazyRouteComponent(() => import('@/features/students/StudentsPage'), 'StudentsPage'),
})

const studentDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/students/$studentId',
  component: lazyRouteComponent(() => import('@/features/students/StudentDetailPage'), 'StudentDetailPage'),
})

const guardiansRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/guardians',
  component: lazyRouteComponent(() => import('@/features/guardians/GuardiansPage'), 'GuardiansPage'),
})

const guardianDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/guardians/$guardianId',
  component: lazyRouteComponent(
    () => import('@/features/guardians/GuardianDetailPage'),
    'GuardianDetailPage',
  ),
})

/**
 * ── Academics ─────────────────────────────────────────────────────────────
 *
 * The routes below match the `route` values the API already emits in the
 * navigation tree — `academic-sessions`, `academic-periods`, `academic-levels`,
 * `programs`, `courses` — so the rail's existing items reach real screens
 * instead of falling through to the module scaffold. A path spelled
 * differently here would leave the item pointing at `/$module` with no
 * indication anything was wrong.
 */
const programsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/programs',
  component: lazyRouteComponent(() => import('@/features/academics/ProgramsPage'), 'ProgramsPage'),
})

const coursesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/courses',
  component: lazyRouteComponent(() => import('@/features/academics/CoursesPage'), 'CoursesPage'),
})

const learningGroupsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/learning-groups',
  component: lazyRouteComponent(
    () => import('@/features/academics/LearningGroupsPage'),
    'LearningGroupsPage',
  ),
})

const courseOfferingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/course-offerings',
  component: lazyRouteComponent(
    () => import('@/features/academics/CourseOfferingsPage'),
    'CourseOfferingsPage',
  ),
})

const enrollmentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/enrollment',
  component: lazyRouteComponent(
    () => import('@/features/academics/EnrollmentPage'),
    'EnrollmentPage',
  ),
})

const academicCalendarRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/academic-calendar',
  component: lazyRouteComponent(
    () => import('@/features/academics/AcademicCalendarPage'),
    'AcademicCalendarPage',
  ),
})

const curriculumRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/curriculum',
  component: lazyRouteComponent(
    () => import('@/features/academics/CurriculumPage'),
    'CurriculumPage',
  ),
})

/**
 * ── Learning ──────────────────────────────────────────────────────────────
 *
 * Only `assignments` and `discussions` are here. `lms` and `learning-progress`
 * appear in the navigation tree but gate NO routes in the API — nothing in
 * `routes/api/` is registered behind `module:lms` or `module:learning_progress`
 * — so they keep falling through to the module scaffold, which says so
 * honestly, rather than getting a screen with nothing behind it.
 */
const assignmentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/assignments',
  component: lazyRouteComponent(
    () => import('@/features/learning/AssignmentsPage'),
    'AssignmentsPage',
  ),
})

const assignmentDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/assignments/$assignmentId',
  component: lazyRouteComponent(
    () => import('@/features/learning/AssignmentDetailPage'),
    'AssignmentDetailPage',
  ),
})

const discussionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discussions',
  component: lazyRouteComponent(
    () => import('@/features/learning/DiscussionsPage'),
    'DiscussionsPage',
  ),
})

/* The rail's "Audit and Security" item. Read-only: the API exposes no write
 * verb on the trail, and this route mounts nothing that could invent one. */
const securityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/audit-security',
  component: lazyRouteComponent(() => import('@/features/security/SecurityPage'), 'SecurityPage'),
})

/**
 * ── Attendance ────────────────────────────────────────────────────────────
 *
 * Only `attendance` is here. `smart-attendance` appears in the navigation but
 * no route in the API is registered behind `module:smart_attendance` — the
 * same as `lms` and `learning-progress` — so it keeps falling through to the
 * module scaffold rather than getting a screen with nothing behind it.
 */
const attendanceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/attendance',
  component: lazyRouteComponent(
    () => import('@/features/attendance/AttendancePage'),
    'AttendancePage',
  ),
})

/* ── Finance modules with their own rail item ───────────────────────────
 * `accounting` and `payment_plans` are separate modules from `finance`: an
 * institution can run fees, invoices and payments without keeping
 * double-entry books or offering instalments. Both surfaces are read-only —
 * the ledger is written by the acts it records, and a plan is agreed against
 * the invoice it settles. */
/* The week, for whoever is asking. `/portal/timetable` resolves whose week to
 * return from the caller's own records, so one screen serves a teacher, a
 * student and a guardian — see TimetablePage. */
const timetableRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/timetable',
  component: lazyRouteComponent(
    () => import('@/features/timetable/TimetablePage'),
    'TimetablePage',
  ),
})

const accountingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounting',
  component: lazyRouteComponent(
    () => import('@/features/accounting/AccountingPage'),
    'AccountingPage',
  ),
})

const paymentPlansRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/payment-plans',
  component: lazyRouteComponent(
    () => import('@/features/paymentplans/PaymentPlansPage'),
    'PaymentPlansPage',
  ),
})

/* ── Student services ──────────────────────────────────────────────────
 * Neither route sits under `admin/` on the API and neither carries `staff`:
 * a learner reads their own emergency card and a guardian reads their
 * child's, so the authorization is complete in the policies rather than the
 * route stack. Health is split in two tiers — see HealthClinicPage. */
const healthClinicRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/health-clinic',
  component: lazyRouteComponent(
    () => import('@/features/studentservices/HealthClinicPage'),
    'HealthClinicPage',
  ),
})

const disciplineRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discipline',
  component: lazyRouteComponent(
    () => import('@/features/studentservices/DisciplinePage'),
    'DisciplinePage',
  ),
})

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/account',
  component: lazyRouteComponent(() => import('@/features/account/AccountPage'), 'AccountPage'),
})

/**
 * Settings is addressed by section — `/settings/sessions`, `/settings/branding`
 * — so a section is linkable, survives a reload and can be sent to somebody.
 * A bare `/settings` lands on the first section the reader can actually reach,
 * which `SettingsPage` decides from their modules and permissions.
 */
const settingsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
})

const settingsSectionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/$section',
  component: lazyRouteComponent(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
})

/**
 * Structure, Sessions, Periods and Year groups moved into Settings — they are
 * the institution's shape rather than places anyone works. The old top-level
 * paths redirect rather than 404: the module scaffold cross-links to them, and
 * they have been linkable for as long as the rail listed them.
 */
const movedStructureRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/institution-structure',
  beforeLoad: () => {
    throw redirect({ to: '/settings/$section', params: { section: 'structure' } })
  },
})

const movedSessionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/academic-sessions',
  beforeLoad: () => {
    throw redirect({ to: '/settings/$section', params: { section: 'sessions' } })
  },
})

const movedPeriodsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/academic-periods',
  beforeLoad: () => {
    throw redirect({ to: '/settings/$section', params: { section: 'periods' } })
  },
})

const academicLevelsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/academic-levels',
  component: lazyRouteComponent(
    () => import('@/features/academics/AcademicLevelsPage'),
    'AcademicLevelsPage',
  ),
})

const communicationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/communications',
  component: lazyRouteComponent(
    () => import('@/features/communications/CommunicationsPage'),
    'CommunicationsPage',
  ),
})

/* ── Learning ────────────────────────────────────────────────────────────── */

/* The API kebab-cases the module id for the nav route, and the module id is
 * `lms` — so the rail's "Lessons" item points here. */
const lessonsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/lms',
  component: lazyRouteComponent(() => import('@/features/lessons/LessonsPage'), 'LessonsPage'),
})

/* ── Admissions ──────────────────────────────────────────────────────────── */

const admissionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admissions',
  component: lazyRouteComponent(
    () => import('@/features/admissions/AdmissionsPage'),
    'AdmissionsPage',
  ),
})

/* An admissions file gets passed between people, so it has its own address. */
const applicationDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admissions/$applicationId',
  component: lazyRouteComponent(
    () => import('@/features/admissions/ApplicationDetailPage'),
    'ApplicationDetailPage',
  ),
})

/* ── Operations ──────────────────────────────────────────────────────────── */

const libraryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/library',
  component: lazyRouteComponent(
    () => import('@/features/operations/LibraryPage'),
    'LibraryPage',
  ),
})

const hostelRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/hostel',
  component: lazyRouteComponent(() => import('@/features/operations/HostelPage'), 'HostelPage'),
})

const transportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/transport',
  component: lazyRouteComponent(
    () => import('@/features/operations/TransportPage'),
    'TransportPage',
  ),
})

/* The API's navigation kebab-cases the module id, so the rail's Assets item
 * points here rather than at `/assets`. */
const assetsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/assets-inventory',
  component: lazyRouteComponent(() => import('@/features/operations/AssetsPage'), 'AssetsPage'),
})

const notificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/notifications',
  component: lazyRouteComponent(() => import('@/features/notifications/NotificationsPage'), 'NotificationsPage'),
})

const helpRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/help',
  component: lazyRouteComponent(() => import('@/features/help/HelpPage'), 'HelpPage'),
})

/**
 * Every other module the API offers.
 *
 * The rail is server-driven and lists roughly sixty modules for an institution
 * owner. Rather than 404 the ones without a bespoke screen yet — which would
 * make the product look broken to anybody who clicked past the built-out
 * surfaces — this resolves the module from the navigation tree and renders its
 * scaffold: the real title, the real description, and an honest note that the
 * screen is not built. TanStack Router ranks static paths above dynamic ones,
 * so `/students` still reaches `StudentsPage`.
 */
/**
 * Reports and Analytics.
 *
 * A real screen rather than the module scaffold, so the navigation item the
 * API already emits (`route: "reports"`) reaches something. Declared beside
 * the catch-all it replaces: TanStack ranks static paths above dynamic ones
 * regardless of order, but keeping them adjacent shows the next person what
 * the scaffold is standing in for.
 */
const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports',
  component: lazyRouteComponent(() => import('@/features/reports/ReportsPage'), 'ReportsPage'),
})

const reportDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports/$reportId',
  component: lazyRouteComponent(
    () => import('@/features/reports/ReportDetailPage'),
    'ReportDetailPage',
  ),
})

/**
 * Assessment — the question bank.
 *
 * The pages existed but nothing routed to them, so their `Link`s pointed at a
 * path TanStack did not know and the build failed on it. Wiring them is what
 * finishes the feature rather than discarding it.
 */
/* The umbrella. `module:assessments` gates no endpoints, so this is a hub
 * over the surfaces that do — see AssessmentPage for the full reasoning. */
const assessmentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/assessments',
  component: lazyRouteComponent(
    () => import('@/features/assessment/AssessmentPage'),
    'AssessmentPage',
  ),
})

const gradingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/grading',
  component: lazyRouteComponent(() => import('@/features/assessment/GradingPage'), 'GradingPage'),
})

const gradebookRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gradebook',
  component: lazyRouteComponent(
    () => import('@/features/assessment/GradebookPage'),
    'GradebookPage',
  ),
})

/* The results WORKFLOW, gated on the gradebook module rather than on
 * `results` — the API puts calculate/approve/publish inside the gradebook
 * group, and `module:results` gates only the learner-facing portal reads. */
const resultsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/results',
  component: lazyRouteComponent(() => import('@/features/assessment/ResultsPage'), 'ResultsPage'),
})

/* Computer-based testing. The candidate's surface — sitting a paper, and
 * reading a released one back. `cbt` reaches `student_self`, so the rail
 * draws this for the people the tests are for. */
const examsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cbt',
  component: lazyRouteComponent(() => import('@/features/exams/ExamsPage'), 'ExamsPage'),
})

const questionBankRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/question-bank',
  component: lazyRouteComponent(
    () => import('@/features/assessment/QuestionBanksPage'),
    'QuestionBanksPage',
  ),
})

const questionBankDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/question-bank/$bankId',
  component: lazyRouteComponent(
    () => import('@/features/assessment/QuestionBankDetailPage'),
    'QuestionBankDetailPage',
  ),
})

/**
 * Finance.
 *
 * `/finance` is the module the API's navigation calls "Student Finance". The
 * two detail routes sit under it rather than at the top level because an
 * invoice and a payment are only ever reached from there, and a nested path
 * keeps the rail's longest-prefix match lighting Finance on both.
 */
/* The rail carries `fee_management` as its own item; before this it fell
 * through to the module scaffold. See FeeManagementPage for why it is a screen
 * of its own rather than only a tab on /finance. */
/*
 * Where a payment provider sends the payer back.
 *
 * Its own path, and deliberately not `/finance/payments/$paymentId` — that is
 * the staff detail screen keyed on a payment's uuid, and what comes back from a
 * provider is an intent REFERENCE. `config/payments.php` builds this URL.
 */
const paymentReturnRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/finance/return/$reference',
  component: lazyRouteComponent(
    () => import('@/features/portal/PaymentReturnPage'),
    'PaymentReturnPage',
  ),
})

const feeManagementRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/fee-management',
  component: lazyRouteComponent(
    () => import('@/features/finance/FeeManagementPage'),
    'FeeManagementPage',
  ),
})

const financeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/finance',
  component: lazyRouteComponent(() => import('@/features/finance/FinancePage'), 'FinancePage'),
})

const invoiceDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/finance/invoices/$invoiceId',
  component: lazyRouteComponent(
    () => import('@/features/finance/InvoiceDetailPage'),
    'InvoiceDetailPage',
  ),
})

const paymentDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/finance/payments/$paymentId',
  component: lazyRouteComponent(
    () => import('@/features/finance/PaymentDetailPage'),
    'PaymentDetailPage',
  ),
})

/* Staff and HR. The pages existed but nothing routed to them. */
const staffRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/staff',
  component: lazyRouteComponent(() => import('@/features/hr/StaffPage'), 'StaffPage'),
})

const staffDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/staff/$staffId',
  component: lazyRouteComponent(() => import('@/features/hr/StaffDetailPage'), 'StaffDetailPage'),
})

const hrRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/hr',
  component: lazyRouteComponent(() => import('@/features/hr/HrPage'), 'HrPage'),
})

const payrollRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/payroll',
  component: lazyRouteComponent(() => import('@/features/hr/PayrollPage'), 'PayrollPage'),
})

/**
 * Identity — who exists, and what they may reach.
 *
 * Two nav items, two screens: `authentication` is the people, `rbac` is the
 * roles and the permission catalogue they draw on. They share a feature
 * directory because a grant is meaningless without the catalogue that names it.
 */
const authenticationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/authentication',
  component: lazyRouteComponent(() => import('@/features/identity/UsersPage'), 'UsersPage'),
})

const userDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/authentication/$userId',
  component: lazyRouteComponent(() => import('@/features/identity/UserAccessPage'), 'UserAccessPage'),
})

const rbacRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/rbac',
  component: lazyRouteComponent(() => import('@/features/identity/RolesPage'), 'RolesPage'),
})

const roleDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/rbac/$roleId',
  component: lazyRouteComponent(() => import('@/features/identity/RoleDetailPage'), 'RoleDetailPage'),
})

/**
 * Tools — five small utilities the API groups under `platform_services`.
 *
 * Each is a single screen, so they share one feature directory rather than
 * five folders of two files. The route segments are the ones the API's own
 * navigation emits, so the rail reaches them without a mapping table.
 */
const toolsDocumentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/document-management',
  component: lazyRouteComponent(() => import('@/features/tools/DocumentsPage'), 'DocumentsPage'),
})

const toolsWorkflowRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/workflow',
  component: lazyRouteComponent(() => import('@/features/tools/WorkflowsPage'), 'WorkflowsPage'),
})

const toolsCustomisationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/customization',
  component: lazyRouteComponent(
    () => import('@/features/tools/CustomFieldsPage'),
    'CustomFieldsPage',
  ),
})

const toolsImportExportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/import-export',
  component: lazyRouteComponent(
    () => import('@/features/tools/ImportExportPage'),
    'ImportExportPage',
  ),
})

const toolsIntegrationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/integrations',
  component: lazyRouteComponent(
    () => import('@/features/tools/IntegrationsPage'),
    'IntegrationsPage',
  ),
})

const moduleRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/$module',
  component: lazyRouteComponent(() => import('@/features/modules/ModulePage'), 'ModulePage'),
})

export const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    indexRoute,
    dashboardRoute,
    studentsRoute,
    studentDetailRoute,
    programsRoute,
    coursesRoute,
    learningGroupsRoute,
    courseOfferingsRoute,
    enrollmentRoute,
    academicCalendarRoute,
    curriculumRoute,
    assignmentsRoute,
    assignmentDetailRoute,
    discussionsRoute,
    attendanceRoute,
    guardiansRoute,
    guardianDetailRoute,
    securityRoute,
    timetableRoute,
    accountingRoute,
    paymentPlansRoute,
    healthClinicRoute,
    disciplineRoute,
    accountRoute,
    settingsIndexRoute,
    settingsSectionRoute,
    movedStructureRoute,
    movedSessionsRoute,
    movedPeriodsRoute,
    academicLevelsRoute,
    notificationsRoute,
    communicationsRoute,
    lessonsRoute,
    admissionsRoute,
    applicationDetailRoute,
    libraryRoute,
    hostelRoute,
    transportRoute,
    assetsRoute,
    helpRoute,
    reportsRoute,
    reportDetailRoute,
    assessmentRoute,
    examsRoute,
    gradingRoute,
    gradebookRoute,
    resultsRoute,
    questionBankRoute,
    questionBankDetailRoute,
    paymentReturnRoute,
    feeManagementRoute,
    financeRoute,
    invoiceDetailRoute,
    paymentDetailRoute,
    staffRoute,
    staffDetailRoute,
    hrRoute,
    payrollRoute,
    authenticationRoute,
    userDetailRoute,
    rbacRoute,
    roleDetailRoute,
    toolsDocumentsRoute,
    toolsWorkflowRoute,
    toolsCustomisationRoute,
    toolsImportExportRoute,
    toolsIntegrationsRoute,
    moduleRoute,
  ]),
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
