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
const academicSessionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/academic-sessions',
  component: lazyRouteComponent(
    () => import('@/features/academics/AcademicSessionsPage'),
    'AcademicSessionsPage',
  ),
})

const academicPeriodsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/academic-periods',
  component: lazyRouteComponent(
    () => import('@/features/academics/AcademicPeriodsPage'),
    'AcademicPeriodsPage',
  ),
})

const academicLevelsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/academic-levels',
  component: lazyRouteComponent(
    () => import('@/features/academics/AcademicLevelsPage'),
    'AcademicLevelsPage',
  ),
})

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

const institutionStructureRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/institution-structure',
  component: lazyRouteComponent(
    () => import('@/features/academics/InstitutionStructurePage'),
    'InstitutionStructurePage',
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

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/account',
  component: lazyRouteComponent(() => import('@/features/account/AccountPage'), 'AccountPage'),
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
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
    academicSessionsRoute,
    academicPeriodsRoute,
    academicLevelsRoute,
    programsRoute,
    coursesRoute,
    learningGroupsRoute,
    courseOfferingsRoute,
    enrollmentRoute,
    institutionStructureRoute,
    academicCalendarRoute,
    curriculumRoute,
    assignmentsRoute,
    assignmentDetailRoute,
    discussionsRoute,
    guardiansRoute,
    guardianDetailRoute,
    securityRoute,
    accountRoute,
    settingsRoute,
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
    questionBankRoute,
    questionBankDetailRoute,
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
