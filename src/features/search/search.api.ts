import { get } from '@/shared/api/client'
import type { TerminologyKey } from '@/shared/types/tenant.types'

/**
 * Cross-module search — `GET /search`.
 *
 * ── The parameter is `search`, not `q` ─────────────────────────────────────
 *
 * Every collection endpoint in this API narrows on `search`, and the one
 * endpoint whose whole job is searching used to be the only one that spelled it
 * differently. `q` is gone rather than deprecated, so sending it produces a 422
 * naming `search` as required — which is what a bare `?q=` returns.
 *
 * ── Two characters, decided by the server ──────────────────────────────────
 *
 * `SearchAcrossModules` refuses to run below two characters and answers with an
 * empty result rather than an error, on the grounds that the first keystroke is
 * not a mistake anybody should be told about. This client does not send that
 * request at all: it is a round trip whose answer is known, and the screen says
 * so instead. `%a%` matches most of an institution, which is why the floor
 * exists.
 *
 * ── `source` is an enum and a typo widens rather than narrows ──────────────
 *
 * The API validates it against its own list and 422s on anything else. The only
 * values this screen ever sends are the ones a previous response named in
 * `searched`, so it cannot invent one.
 */

export interface SearchHit {
  source: string
  id: string
  title: string
  /** A student number, a job title, a course, an incident summary. There is no
   *  body and no match highlight — deliberately, server-side: a snippet is a
   *  disclosure in a smaller font. */
  subtitle: string | null
}

export interface SearchGroup {
  source: string
  /** The API's own name for the group. Overridden only where the institution
   *  has its own word for the concept — see `GROUP_TERMINOLOGY`. */
  label: string
  /** There were more matches than the limit. There is deliberately no total:
   *  a count beside an empty list would state that records exist which the
   *  reader may not see. */
  has_more: boolean
  hits: SearchHit[]
}

export interface SearchResults {
  term: string
  /** The sources that were actually queried for THIS reader. A source they do
   *  not reach is simply absent, and so is one that matched nothing — the two
   *  are indistinguishable on purpose. */
  searched: string[]
  groups: SearchGroup[]
}

/** `SearchAcrossModules::MINIMUM_TERM`. */
export const SEARCH_MIN_TERM = 2
/** `SearchRequest`: `search` is `max:120`. */
export const SEARCH_MAX_TERM = 120
/** `SearchRequest`: `limit` is `min:1|max:25`, capped again in the Action. */
export const SEARCH_MAX_LIMIT = 25

/** Enough of each group to recognise a record without turning the screen into
 *  a roll. Raised to the server's ceiling once one source is chosen. */
export const SEARCH_PREVIEW_LIMIT = 6

export const searchKeys = {
  query: (term: string, source: string, limit: number) =>
    ['search', { term, source, limit }] as const,
}

export function searchQuery(term: string, source: string, limit: number) {
  return get<SearchResults>('/search', {
    params: {
      search: term,
      source: source || undefined,
      limit,
    },
  })
}

/**
 * Where a hit goes.
 *
 * Only learners have a detail screen in this app. The rest land on their
 * module, which is the honest destination: a link that opens a record the app
 * cannot draw is worse than one that opens the module the record lives in.
 *
 * Keyed on the API's own source values, with `discipline_incidents` mapping to
 * the `discipline` module because the source is named for the record and the
 * route is named for the module.
 */
export const SOURCE_MODULE: Record<string, string> = {
  students: 'students',
  staff: 'staff',
  assignments: 'assignments',
  discipline_incidents: 'discipline',
}

export function moduleForSource(source: string): string {
  return SOURCE_MODULE[source] ?? source
}

/**
 * Where the institution has its own word for what a group contains.
 *
 * The API's `label` is fixed English from an enum — "Students" — while a
 * university in this same build calls them Learners everywhere else on the
 * screen. Only the sources whose concept the terminology map actually names are
 * overridden; `staff`, `assignments` and `discipline` have no key and keep the
 * API's label rather than being given an invented one.
 */
export const GROUP_TERMINOLOGY: Record<string, TerminologyKey> = {
  students: 'learners',
}
