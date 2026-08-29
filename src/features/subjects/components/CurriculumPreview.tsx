import { EmptyState } from '@/shared/ui'
import { ListChecks } from '@phosphor-icons/react'
import { formatNumber } from '@/shared/lib/format'
import { DocumentSurface } from './DocumentSurface'
import { ObjectiveList, ResourceList } from './LessonLists'
import type { OfferingCurriculum } from '../curriculum.api'

/**
 * The whole scheme of work, read the way it will be read.
 *
 * ── Rendered by the same editor, not by a second renderer ─────────────────
 *
 * `DocumentSurface` with `editable={false}` is what shows the notes here. A
 * separate HTML renderer would be a second implementation of every block type
 * — tables, checklists, nested lists — and the day they disagree is the day
 * somebody publishes something that looked right in the editor.
 *
 * ── Everything at once, in order ──────────────────────────────────────────
 *
 * The editor shows one lesson because that is how one is written. This shows
 * all of them because that is how a term is checked: a head of department
 * reading before publishing wants the shape of the whole thing, and a printed
 * copy is one Ctrl-P from here.
 */
export function CurriculumPreview({ curriculum }: { curriculum: OfferingCurriculum }) {
  const modules = curriculum.modules ?? []
  const lessons = modules.reduce((total, unit) => total + (unit.topics?.length ?? 0), 0)

  if (modules.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white">
        <EmptyState
          icon={<ListChecks size={20} />}
          title="Nothing to preview"
          description="This curriculum has no units yet."
        />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-8 py-6">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{curriculum.title}</h2>
        <p className="mt-1 text-sm text-gray-600">
          {[
            curriculum.course_title,
            curriculum.learning_group_name,
            curriculum.academic_period_name,
            curriculum.academic_session_name,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          {formatNumber(modules.length)} unit{modules.length === 1 ? '' : 's'} ·{' '}
          {formatNumber(lessons)} lesson{lessons === 1 ? '' : 's'}
        </p>
        {curriculum.summary && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-700">{curriculum.summary}</p>
        )}
      </div>

      <div className="mx-auto max-w-3xl px-8 py-6">
        {modules.map((unit, unitIndex) => (
          <section key={unit.id} className="mb-8 last:mb-0">
            <h3 className="text-lg font-semibold tracking-tight text-gray-900">
              <span className="mr-2 text-gray-500">{unitIndex + 1}.</span>
              {unit.title}
            </h3>

            {unit.description && (
              <p className="mt-1 text-sm leading-6 text-gray-700">{unit.description}</p>
            )}

            {(unit.topics ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No lessons in this unit.</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-5">
                {(unit.topics ?? []).map((topic, topicIndex) => (
                  <li key={topic.id}>
                    <h4 className="text-sm font-semibold text-gray-900">
                      <span className="mr-2 text-gray-500">
                        {unitIndex + 1}.{topicIndex + 1}
                      </span>
                      {topic.title}
                      {topic.duration_minutes !== null && (
                        <span className="ml-2 font-normal text-gray-500">
                          {topic.duration_minutes} min
                        </span>
                      )}
                    </h4>

                    {topic.summary && (
                      <p className="mt-1 text-sm leading-6 text-gray-700">{topic.summary}</p>
                    )}

                    {/* Read-only here, and absent rather than empty when a
                      * lesson has none — a heading above nothing is a heading
                      * about the absence of content. */}
                    <ObjectiveList
                      objectives={topic.objectives ?? []}
                      editable={false}
                      onChange={() => undefined}
                      variant="inline"
                    />

                    {topic.has_notes || (topic.notes?.length ?? 0) > 0 ? (
                      <div className="mt-1">
                        <DocumentSurface
                          documentKey={`preview-${topic.id}`}
                          initialContent={topic.notes}
                          editable={false}
                          onChange={() => undefined}
                        />
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">Not written up yet.</p>
                    )}

                    <ResourceList
                      resources={topic.resources ?? []}
                      editable={false}
                      onChange={() => undefined}
                      variant="inline"
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
