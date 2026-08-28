import { Link } from '@tanstack/react-router'
import { CaretRight, Exam } from '@phosphor-icons/react'
import { PageStack } from '@/shared/layout/AppShell'
import { ModuleIcon } from '@/shared/icons/moduleIcons'
import { useModules, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { Card, CardHeader, EmptyState, EntityIcon, PageHeader } from '@/shared/ui'

/**
 * "Assessment and Examination".
 *
 * ── Why this is a hub and not a screen with data ───────────────────────────
 *
 * `module:assessments` gates NO routes in the API. Every other module in the
 * rail names at least one endpoint; this one names none, because assessment is
 * spread across five modules that each own their own surface:
 *
 *   question_bank  the reusable questions papers are built from
 *   cbt            the papers themselves, their sittings and marking
 *   gradebook      what the marks roll up into
 *   grading        the scales marks are reported on
 *   results        what is published to learners and guardians
 *   report_cards   the printed record
 *
 * So this screen sends the reader to the one they want, and says plainly that
 * it holds nothing itself. Inventing a dashboard here would mean inventing the
 * data to put on it.
 *
 * The links are drawn from the reader's OWN navigation tree, so nothing here
 * is a dead end: a teacher sees CBT because they hold it, and an institution
 * owner does not, because this institution does not grant it to them.
 */

/** Module id → the route this app actually serves it at. Anything not listed
 *  falls through to the module scaffold, which is honest about being unbuilt. */
const BUILT: Record<string, string> = {
  question_bank: '/question-bank',
}

const BLURBS: Record<string, string> = {
  question_bank: 'Reusable questions, grouped into banks and versioned as they are rewritten.',
  cbt: 'Papers assembled from the bank, their sittings, and the marking queue.',
  gradebook: 'Where marks are entered and rolled up for a class.',
  grading: 'The scales and boundaries marks are reported on.',
  results: 'What is published to learners and guardians.',
  report_cards: 'The printed record for a period.',
}

/** The order a reader would work through them, not alphabetical. */
const ORDER = ['question_bank', 'cbt', 'gradebook', 'grading', 'results', 'report_cards']

export function AssessmentPage() {
  const t = useTerminology()
  const { access } = useTenant()
  const modules = useModules()

  /* Resolved from the reader's own navigation so the labels are the API's and
   * nothing is offered that they cannot reach. */
  const offered = new Map<string, { label: string; route: string | null }>()
  for (const section of access?.navigation.sections ?? []) {
    for (const item of section.children) {
      if (item.module_id) offered.set(item.module_id, { label: item.label, route: item.route })
    }
  }

  const surfaces = ORDER.filter((id) => offered.has(id) && modules.has(id))

  return (
    <PageStack>
      <PageHeader
        title={t('assessments')}
        description="This module has no screen of its own. It is the front door to the surfaces that do."
        icon={
          <EntityIcon>
            <Exam size={18} />
          </EntityIcon>
        }
      />

      <Card>
        <CardHeader
          title="Where assessment lives"
          subtitle="Drawn from your own navigation, so nothing here is a dead end."
        />

        {surfaces.length === 0 && (
          <EmptyState
            icon={<Exam size={20} />}
            title="No assessment modules are switched on"
            description="An administrator can enable them for this institution."
          />
        )}

        <ul className="divide-y divide-gray-200">
          {surfaces.map((id) => {
            const item = offered.get(id)!
            const href = BUILT[id] ?? (item.route ? `/${item.route}` : null)
            if (!href) return null

            return (
              <li key={id}>
                <Link
                  to={href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700">
                    <ModuleIcon name={id} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {item.label}
                    </span>
                    <span className="block truncate text-xs text-gray-600">
                      {BLURBS[id] ?? ''}
                    </span>
                  </span>
                  {!(id in BUILT) && (
                    <span className="shrink-0 text-xs text-gray-500">Not built yet</span>
                  )}
                  <CaretRight size={13} className="shrink-0 text-gray-500" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>
    </PageStack>
  )
}
