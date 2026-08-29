import { StatusBadge } from '@/shared/ui'
import type { CurriculumStatus } from '../curriculum.api'

/**
 * Where a scheme of work has got to.
 *
 * Three states, and the difference between them is what can be DONE, not how
 * finished something looks: a draft can be written into, a published one is
 * frozen by a database trigger and is what the class is actually being taught,
 * an archived one is kept for the record.
 *
 * It delegates to `StatusBadge` rather than picking its own colours, because
 * "published" already means something in every other table in this app and a
 * second vocabulary for it here would be a second thing to keep in step.
 *
 * "Not started" is not one of the three — it is the ABSENCE of a document — so
 * it renders as muted text rather than as a fourth badge competing with them.
 * That absence is what a head of department opens this screen to find.
 */
export function CurriculumStatusBadge({ status }: { status: CurriculumStatus | null }) {
  if (status === null) return <span className="text-xs text-gray-500">Not started</span>

  return <StatusBadge status={status} />
}
