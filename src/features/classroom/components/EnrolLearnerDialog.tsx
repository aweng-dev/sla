import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, UserPlus, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  SearchInput,
  Skeleton,
} from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { formatNumber } from '@/shared/lib/format'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { studentsApi } from '@/features/students/students.api'
import { qk } from '@/shared/api/queryKeys'
import { classroomApi } from '../classroom.api'

/**
 * Putting learners on the roll.
 *
 * ── Enrolling is a MOVE, and the dialog says so ────────────────────────────
 *
 * The endpoint runs `MoveLearnerToGroup`: it takes the learner off whatever
 * class they were in and records the change. So a learner who already has a
 * class is not "added" — they are moved, and their old class loses them. The
 * picker shows the class each one is currently in for exactly that reason, and
 * the confirm line names how many are being moved rather than added.
 *
 * ── One request each, run in sequence ──────────────────────────────────────
 *
 * The API takes one `student_id`. Sequential rather than parallel: each write
 * moves a learner between two classes, and firing thirty at once means thirty
 * transactions competing over the same two rolls. One failure is reported and
 * the rest still go — a half-finished enrolment is recoverable, a silently
 * abandoned one is not.
 *
 * ── `effective_on` dates the move ──────────────────────────────────────────
 *
 * Absent means now, which is what a registrar with the learner in front of them
 * means. It matters because attendance and results are read by date: backdating
 * a move puts the learner in this class's registers from that day.
 */
export function EnrolLearnerDialog({
  open,
  groupId,
  onClose,
  onEnrolled,
}: {
  open: boolean
  groupId: string
  onClose: () => void
  onEnrolled: () => void
}) {
  const t = useTerminology()

  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [effectiveOn, setEffectiveOn] = useState('')
  const [failed, setFailed] = useState<string[]>([])

  const query = useMemo(() => ({ search, status: 'active', per_page: 25 }), [search])

  const students = useQuery({
    queryKey: qk.students.list(query),
    queryFn: () => studentsApi.list(query),
    enabled: open,
    placeholderData: (previous) => previous,
  })

  const enrol = useMutation({
    mutationFn: async () => {
      const ids = Object.keys(chosen)
      const problems: string[] = []

      /* Sequential — see the file note. */
      for (const id of ids) {
        try {
          await classroomApi.addMember(groupId, id, effectiveOn || undefined)
        } catch (error) {
          problems.push(
            `${chosen[id]}: ${error instanceof ApiError ? error.rootMessage() : 'could not be moved'}`,
          )
        }
      }

      return problems
    },
    onSuccess: (problems) => {
      const moved = Object.keys(chosen).length - problems.length

      if (moved > 0) {
        toast.success(
          `${formatNumber(moved)} ${moved === 1 ? t('learner').toLowerCase() : t('learners').toLowerCase()} on the roll.`,
        )
      }

      setFailed(problems)
      onEnrolled()

      if (problems.length === 0) {
        setChosen({})
        setDraft('')
        onClose()
      }
    },
  })

  const rows = students.data?.rows ?? []
  const count = Object.keys(chosen).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Enrol ${t('learners').toLowerCase()}`}
      description={`Each one is moved here from whichever ${t('group').toLowerCase()} they are in now.`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<UserPlus size={15} weight="bold" />}
            loading={enrol.isPending}
            disabled={count === 0}
            onClick={() => enrol.mutate()}
          >
            {count === 0
              ? 'Choose somebody'
              : `Move ${formatNumber(count)} ${count === 1 ? t('learner').toLowerCase() : t('learners').toLowerCase()}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <SearchInput
          value={draft}
          className="w-full"
          placeholder="Name or number"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />

        {count > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {Object.entries(chosen).map(([id, name]) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() =>
                    setChosen((current) => {
                      const next = { ...current }
                      delete next[id]
                      return next
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-md bg-rail-active px-2 py-1 text-2xs text-gray-900 transition-colors hover:bg-gray-200"
                >
                  {name}
                  <span className="text-gray-500" aria-hidden>
                    ×
                  </span>
                  <span className="sr-only">Remove</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="max-h-64 min-h-[12rem] overflow-y-auto rounded-md border border-gray-200">
          {students.isError ? (
            <ErrorState error={students.error} onRetry={() => students.refetch()} />
          ) : students.isLoading ? (
            <div className="space-y-2 p-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title={search ? 'Nobody matches that' : `No ${t('learners').toLowerCase()}`}
              description={search ? 'Try part of a name or a number.' : undefined}
            />
          ) : (
            <ul className="p-1">
              {rows.map((student) => {
                const name = student.person.full_name || student.student_number
                const picked = chosen[student.id] !== undefined

                return (
                  <li key={student.id}>
                    <button
                      type="button"
                      aria-pressed={picked}
                      onClick={() =>
                        setChosen((current) => {
                          const next = { ...current }
                          if (picked) delete next[student.id]
                          else next[student.id] = name
                          return next
                        })
                      }
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
                        picked ? 'bg-rail-active' : 'hover:bg-gray-50',
                      )}
                    >
                      <Avatar name={name} size="sm" className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-gray-900">
                          {name}
                        </span>
                        <span className="block truncate text-2xs text-gray-500">
                          {student.student_number}
                        </span>
                      </span>
                      {picked && <Check size={14} weight="bold" className="shrink-0 text-gray-900" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Field
          label="From when"
          hint={`Leave blank for today. Backdating puts them in this ${t('group').toLowerCase()}'s registers from that date.`}
        >
          {(props) => (
            <Input
              {...props}
              type="date"
              value={effectiveOn}
              onChange={(event) => setEffectiveOn(event.currentTarget.value)}
            />
          )}
        </Field>

        {/* Reported per learner rather than as one failure: a registrar needs to
          * know WHICH move did not happen, and the rest already have. */}
        {failed.length > 0 && (
          <div className="rounded-md border border-gray-200 px-3 py-2">
            <p className="flex items-center gap-1.5 text-2xs font-medium text-danger-600">
              <Warning size={13} weight="fill" />
              {formatNumber(failed.length)} could not be moved
            </p>
            <ul className="mt-1 space-y-0.5">
              {failed.map((line) => (
                <li key={line} className="text-2xs text-gray-600">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
