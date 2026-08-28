import { useTenant } from '@/features/tenant/TenantProvider'
import { AdminDashboard } from './AdminDashboard'
import { TeacherDashboard } from './TeacherDashboard'
import { StudentDashboard } from './StudentDashboard'
import { GuardianDashboard } from './GuardianDashboard'

/**
 * Four dashboards behind one route.
 *
 * ── Why this branches rather than hides ────────────────────────────────────
 *
 * A registrar, a form tutor, a fifteen-year-old and their mother open the same
 * URL and want four unrelated things. Building one screen and hiding parts of
 * it would give the parent a layout designed around institution-wide totals
 * with most of it missing — which reads as a broken admin console rather than
 * as a parent's page. So each portal gets a screen composed for the question
 * that portal actually asks, and they share primitives rather than structure.
 *
 * ── Why the client does not choose ─────────────────────────────────────────
 *
 * `portal` is decided by the API from the caller's access profiles, not from a
 * setting or a route. A person who is both a teacher and a parent is given one
 * answer server-side, and this file honours it — a client-side guess would
 * disagree with the endpoints the same person is allowed to call.
 */
export function DashboardPage() {
  const { portal } = useTenant()

  switch (portal) {
    case 'admin':
      return <AdminDashboard />

    /*
     * `staff` is the portal for a member of staff who teaches nothing — a
     * bursar's assistant, a matron. Their screen is the teaching one because
     * it is the one built around a personal scope rather than the whole
     * institution: the panels that do not apply to them return empty and say
     * so, which is the honest answer. It is not the administrator's screen,
     * whose figures they have no permission to load.
     */
    case 'staff':
    case 'teacher':
      return <TeacherDashboard />

    case 'guardian':
      return <GuardianDashboard />

    case 'student':
    default:
      return <StudentDashboard />
  }
}
