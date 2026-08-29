/**
 * Who is looking, and why a module is not on their screen.
 *
 * Both facts already travel on `GET /portal/context`; neither was typed, so
 * every screen re-guessed them. Transcribed from `ModuleResource` and
 * `AccessContextResource`.
 */

/**
 * Why a module resolved the way it did.
 *
 * The distinction that matters to a reader is the last two. `denied` means the
 * INSTITUTION does not have it — wrong type for it, or not entitled. Every
 * other value on a disabled module means the institution has it and this
 * PERSON does not reach it.
 */
export type ModuleSource =
  | 'institution_default'
  | 'entitlement'
  | 'tenant_override'
  | 'user_permission'
  | 'denied'

/**
 * The kinds of person the API recognises, as `AccessProfile`.
 *
 * A user holds several: a head of year is `academic_management` and
 * `teacher_access`, and a teacher whose own child attends the school is
 * `teacher_access` and `guardian_children` at once. So this is always a set,
 * and "is a learner" means *only* learner profiles — never "has one".
 */
export type AccessProfile =
  | 'platform_full'
  | 'institution_full'
  | 'academic_management'
  | 'teacher_access'
  | 'student_self'
  | 'guardian_children'
  | 'finance_management'
  | 'admissions_management'
  | 'hr_management'
  | 'operations_management'
  | 'technical_admin'
  | 'audit_readonly'
  | 'student_services'

/** The two profiles that are about oneself or one's children rather than
 *  about running the institution. */
export const LEARNER_PROFILES: AccessProfile[] = ['student_self', 'guardian_children']
