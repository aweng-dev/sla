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

const notificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/notifications',
  component: lazyRouteComponent(() => import('@/features/notifications/NotificationsPage'), 'NotificationsPage'),
})

const searchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/search',
  component: lazyRouteComponent(() => import('@/features/search/SearchPage'), 'SearchPage'),
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
    guardiansRoute,
    guardianDetailRoute,
    accountRoute,
    settingsRoute,
    notificationsRoute,
    searchRoute,
    helpRoute,
    reportsRoute,
    reportDetailRoute,
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
