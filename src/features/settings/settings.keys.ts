/**
 * Cache keys for the two endpoints `@/shared/api/queryKeys` does not name yet.
 *
 * The academic year already has keys there — `qk.academics.sessions()` and
 * `qk.academics.periods()` — and this screen uses those rather than inventing
 * a second name for the same rows: a period made current here has to
 * invalidate the picker that a fee screen filled itself from.
 *
 * These two are local because `shared/` belongs to nobody in particular while
 * this feature is being written. They follow the same hierarchy rule, so
 * invalidating `settingsKeys.all` clears everything beneath it.
 */
export const settingsKeys = {
  all: ['settings'] as const,
  institution: ['settings', 'institution'] as const,
  features: ['settings', 'features'] as const,
}
