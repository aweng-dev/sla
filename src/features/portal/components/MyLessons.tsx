import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, CaretLeft } from '@phosphor-icons/react'
import { Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { formatNumber } from '@/shared/lib/format'
import { lessonKeys, lessonsPortalApi } from '@/features/lessons/lessons.api'

/**
 * Course material, as the class reads it.
 *
 * ── Everything here is already published ───────────────────────────────────
 *
 * The portal listing returns published units, and inside them only published
 * lessons. So there is no draft state to render and no "not ready yet" badge:
 * a unit a teacher is still writing is not in this payload at all, and the API
 * answers 404 rather than 403 for one, so a learner cannot tell a unit that is
 * not ready from one that does not exist.
 *
 * ── The contents page carries no bodies ────────────────────────────────────
 *
 * A unit's lessons arrive as titles; the text travels only when one is opened.
 * That is the difference between a payload a phone renders instantly and one it
 * spends a second parsing, and it is why opening a lesson is its own request.
 */
export function MyLessons() {
  const [openModuleId, setOpenModuleId] = useState<string | null>(null)
  const [openLessonId, setOpenLessonId] = useState<string | null>(null)

  const modules = useQuery({
    queryKey: lessonKeys.portalModules,
    queryFn: () => lessonsPortalApi.modules(),
  })

  const unit = useQuery({
    queryKey: lessonKeys.portalModule(openModuleId ?? 'none'),
    queryFn: () => lessonsPortalApi.module(openModuleId!),
    enabled: openModuleId !== null,
  })

  const lesson = useQuery({
    queryKey: lessonKeys.portalLesson(openModuleId ?? 'none', openLessonId ?? 'none'),
    queryFn: () => lessonsPortalApi.lesson(openModuleId!, openLessonId!),
    enabled: openModuleId !== null && openLessonId !== null,
  })

  if (modules.isError) {
    return (
      <Card>
        <ErrorState error={modules.error} onRetry={() => modules.refetch()} />
      </Card>
    )
  }

  if (modules.isLoading) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    )
  }

  const rows = modules.data?.rows ?? []

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<BookOpen size={20} />}
          title="No material yet"
          description="Units appear here as your teachers open them, and lessons inside them a week at a time."
        />
      </Card>
    )
  }

  /* ── Reading one lesson ───────────────────────────────────────────────── */
  if (openLessonId !== null) {
    return (
      <Card>
        <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<CaretLeft size={14} />}
            onClick={() => setOpenLessonId(null)}
          >
            Back to the unit
          </Button>
        </div>

        {lesson.isLoading ? (
          <div className="space-y-3 p-4" aria-hidden>
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : lesson.isError ? (
          <ErrorState error={lesson.error} onRetry={() => lesson.refetch()} />
        ) : (
          <article className="px-4 py-4">
            <h2 className="text-md font-semibold text-gray-900">{lesson.data?.title}</h2>
            {lesson.data?.body ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-800">
                {lesson.data.body}
              </p>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                This lesson has no written content — it may be delivered in class.
              </p>
            )}
          </article>
        )}
      </Card>
    )
  }

  /* ── Inside one unit ──────────────────────────────────────────────────── */
  if (openModuleId !== null) {
    const lessons = unit.data?.lessons ?? []

    return (
      <Card>
        <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<CaretLeft size={14} />}
            onClick={() => setOpenModuleId(null)}
          >
            All units
          </Button>
        </div>

        {unit.isLoading ? (
          <div className="space-y-2 p-4" aria-hidden>
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : unit.isError ? (
          <ErrorState error={unit.error} onRetry={() => unit.refetch()} />
        ) : (
          <>
            <CardHeader
              title={unit.data?.title ?? 'Unit'}
              subtitle={
                [unit.data?.course_title, unit.data?.description].filter(Boolean).join(' · ') ||
                undefined
              }
            />

            {lessons.length === 0 ? (
              <EmptyState
                title="Nothing published in this unit yet"
                description="Lessons appear here as they are opened to the class."
              />
            ) : (
              <ol className="divide-y divide-gray-200">
                {lessons.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setOpenLessonId(entry.id)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40"
                    >
                      <span className="w-5 shrink-0 text-right text-2xs text-gray-500 tabular">
                        {entry.sequence}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                        {entry.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Card>
    )
  }

  /* ── The units ────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-3">
      {rows.map((module) => (
        <Card key={module.id}>
          <button
            type="button"
            onClick={() => setOpenModuleId(module.id)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
              'hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">
                {module.title}
              </span>
              <span className="block truncate text-2xs text-gray-600">
                {module.course_title ?? 'Course material'}
                {module.published_lesson_count !== undefined && (
                  <>
                    <span className="px-1 text-gray-400" aria-hidden>
                      ·
                    </span>
                    {formatNumber(module.published_lesson_count)}{' '}
                    {module.published_lesson_count === 1 ? 'lesson' : 'lessons'}
                  </>
                )}
              </span>
            </span>
          </button>
        </Card>
      ))}
    </div>
  )
}
