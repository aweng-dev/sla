import type { Terminology } from '@/shared/types/tenant.types'

/** `GET|PUT /admin/institution`. Transcribed from live responses. */
export interface Institution {
  id: string
  name: string
  legal_name: string | null
  slug: string
  institution_type: string
  institution_subtype: string | null
  status: string
  default_timezone: string
  default_locale: string
  default_currency: string
  country_code: string | null
  logo_path: string | null
  /** Unlike the account avatar, the logo IS a URL — it is served to people who
   *  have not signed in yet, on the sign-in page. */
  logo_url: string | null
  terminology: Terminology
  platform_domain: string
  onboarding_completed_at: string | null
  created_at: string
}

/**
 * `GET /admin/features`.
 *
 * Read-only, and there is no companion write route anywhere in the API: these
 * are the platform's switches on the institution's subscription, enforced by
 * `feature:<key>` middleware on the routes each one covers.
 */
export interface FeatureSwitch {
  key: string
  name: string
  description: string
  group: string
  enabled: boolean
}

/** `GET /admin/academic-sessions` — the academic year as a record. */
export interface AcademicSession {
  id: string
  name: string
  code: string | null
  starts_on: string | null
  ends_on: string | null
  is_current: boolean
  is_default: boolean
  status: string
  status_label: string
  is_open: boolean
  period_count: number
  /**
   * Optional because the API sends it conditionally, not because it is
   * uninteresting. `AcademicSessionResource` wraps it in `when()`: the listing
   * supplies it from one grouped query and the record view derives it from the
   * reference counts, but `POST {id}/make-current` — which this screen calls
   * and whose answer it writes back into the same cache — computes neither and
   * omits the key entirely. Declaring it required makes every row that came
   * back from a transition claim a `false` it never sent, which is the wrong
   * answer: a year that IS removable would get a greyed-out Remove button.
   */
  is_removable?: boolean
  /** The API's own answer to "may this caller change this row", already
   *  resolved against the policy. Cheaper and more truthful than re-deriving
   *  it from the permission list. */
  can_manage: boolean
}

/** `GET /admin/academic-periods`. `type`/`type_label` is the institution's own
 *  KIND label for the division — "Term" here, "Semester" elsewhere. The
 *  concept is always a Period. */
export interface AcademicPeriod {
  id: string
  name: string
  code: string | null
  type: string
  type_label: string
  sequence: number
  academic_session_id: string
  academic_session_name: string | null
  starts_on: string | null
  ends_on: string | null
  is_current: boolean
  status: string
  status_label: string
  is_open: boolean
  child_count: number
  can_manage: boolean
}
