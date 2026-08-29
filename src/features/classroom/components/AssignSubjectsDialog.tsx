import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Button,
  EmptyState,
  Field,
  Modal,
  SearchInput,
  Select,
  Skeleton,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { coursesApi, periodsApi } from '@/features/academics/academics.api'
import { academicsKeys } from '@/features/academics/academics.keys'
import { classroomApi } from '../classroom.api'

/**
 * Choosing what a class is taught.
 *
 * ── Nine at once, because that is how a term is set up ─────────────────────
 *
 * The endpoint takes a list of course ids and creates one offering each. A
 * registrar opening a class in September picks the whole curriculum in one
 * pass; one dialog per subject would be nine dialogs.
 *
 * ── Electives are a separate list on the same call ─────────────────────────
 *
 * `elective_course_ids` marks the offerings as optional. Same request, because
 * the choice of which subjects are compulsory is made at the same moment as the
 * choice of subjects.
 *
 * ── The period is required and is not guessed ──────────────────────────────
 *
 * An offering belongs to a term. Defaulting it to whatever is current would
 * quietly create this year's Biology under last year's term the first time
 * somebody opened the screen in the holidays.
 */
export function AssignSubjectsDialog({
  open,
  groupId,
  onClose,
  onAssigned,
}: {
  open: boolean
  groupId: string
  onClose: () => void
  onAssigned: () => void
}) {
  const t = useTerminology()
  const { access } = useTenant()

  const [periodId, setPeriodId] = useState('')
  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [electives, setElectives] = useState<Record<string, true>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setChosen({})
    setElectives({})
    setDraft('')
    /* Offered, never assumed — see the file note. */
    setPeriodId(access?.calendar?.period?.id ?? '')
  }, [open, access?.calendar?.period?.id])

  const periods = useQuery({
    queryKey: academicsKeys.periods.list({ per_page: 100 }),
    queryFn: () => periodsApi.list({ per_page: 100 }),
    enabled: open,
  })

  const query = useMemo(() => ({ search, status: 'active', per_page: 50 }), [search])

  const courses = useQuery({
    queryKey: academicsKeys.courses.list(query),
    queryFn: () => coursesApi.list(query),
    enabled: open,
    placeholderData: (previous) => previous,
  })

  const assign = useMutation({
    mutationFn: () =>
      classroomApi.assignCourses(groupId, {
        academic_period_id: periodId,
        course_ids: Object.keys(chosen),
        elective_course_ids: Object.keys(electives),
      }),
    onSuccess: (result) => {
      toast.success(
        result.skipped_count === 0
          ? `${formatNumber(result.created_count)} added.`
          : `${formatNumber(result.created_count)} added, ${formatNumber(result.skipped_count)} already there.`,
      )
      onAssigned()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('Those could not be added.')
    },
  })

  const rows = courses.data?.rows ?? []
  const count = Object.keys(chosen).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add ${t('courses').toLowerCase()}`}
      description={`One offering is created per ${t('course').toLowerCase()} — the ${t('course').toLowerCase()} as taught to this ${t('group').toLowerCase()} this term.`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={assign.isPending}
            disabled={count === 0 || periodId === ''}
            onClick={() => assign.mutate()}
          >
            {count === 0 ? 'Choose some' : `Add ${formatNumber(count)}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Field label={t('period')} required error={errors.academic_period_id}>
          {(props) => (
            <Select
              {...props}
              value={periodId}
              onChange={(event) => setPeriodId(event.currentTarget.value)}
              placeholder={`Choose a ${t('period').toLowerCase()}`}
              options={(periods.data?.rows ?? []).map((period) => ({
                value: period.id,
                label: period.name,
              }))}
            />
          )}
        </Field>

        <SearchInput
          value={draft}
          className="w-full"
          placeholder={`Search ${t('courses').toLowerCase()}`}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />

        <div className="max-h-64 min-h-[12rem] overflow-y-auto rounded-md border border-gray-200">
          {courses.isLoading ? (
            <div className="space-y-2 p-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title={search ? 'Nothing matches that' : `No ${t('courses').toLowerCase()}`}
            />
          ) : (
            <ul className="p-1">
              {rows.map((course) => {
                const picked = chosen[course.id] !== undefined

                return (
                  <li key={course.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={picked}
                      onClick={() =>
                        setChosen((current) => {
                          const next = { ...current }
                          if (picked) {
                            delete next[course.id]
                            setElectives((e) => {
                              const copy = { ...e }
                              delete copy[course.id]
                              return copy
                            })
                          } else next[course.id] = course.title
                          return next
                        })
                      }
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
                        picked ? 'bg-rail-active' : 'hover:bg-gray-50',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-gray-900">
                          {course.title}
                        </span>
                        <span className="block truncate text-2xs text-gray-500">{course.code}</span>
                      </span>
                      {picked && <Check size={14} weight="bold" className="shrink-0 text-gray-900" />}
                    </button>

                    {/* Only meaningful once chosen, so it appears then. */}
                    {picked && (
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pr-2 text-2xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={electives[course.id] === true}
                          onChange={(event) =>
                            setElectives((current) => {
                              const next = { ...current }
                              if (event.currentTarget.checked) next[course.id] = true
                              else delete next[course.id]
                              return next
                            })
                          }
                          className="h-3.5 w-3.5 accent-gray-900"
                        />
                        Optional
                      </label>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
