import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, UserCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Avatar, Button, EmptyState, Modal, SearchInput, Skeleton } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { staffApi } from '@/features/hr/hr.api'
import { classroomApi } from '../classroom.api'

/**
 * Naming the class teacher.
 *
 * ── It is a field on the class, not an endpoint of its own ─────────────────
 *
 * `form_tutor_staff_id`, written through the ordinary group update. The
 * controller distinguishes three cases with `$request->exists()`: the key
 * ABSENT means leave the current tutor alone, an id sets it, and an explicit
 * NULL unassigns. This dialog only ever sends the second or the third — never
 * absent — because absent from here would look like a save that did nothing.
 *
 * ── Setting it changes who can reach the class ─────────────────────────────
 *
 * `ResolveUserScopes` reads this column to grant a tutor reach over their own
 * class, and the write dispatches `LearningGroupTutorChanged` to clear the
 * cached access. So this is a permissions change wearing the clothes of a
 * dropdown, and the copy says so.
 */
export function SetClassTeacherDialog({
  open,
  groupId,
  currentStaffId,
  currentName,
  onClose,
  onSaved,
}: {
  open: boolean
  groupId: string
  currentStaffId: string | null
  currentName: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTerminology()

  const [draft, setDraft] = useState('')
  const search = useDebounced(draft, 300)
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft('')
    setPicked(currentStaffId)
  }, [open, currentStaffId])

  const query = useMemo(() => ({ search, status: 'active', per_page: 25 }), [search])

  const staff = useQuery({
    queryKey: ['hr', 'staff', 'list', query],
    queryFn: () => staffApi.list(query),
    enabled: open,
    placeholderData: (previous) => previous,
  })

  const save = useMutation({
    mutationFn: () => classroomApi.setClassTeacher(groupId, picked),
    onSuccess: () => {
      toast.success(
        picked === null
          ? `${t('classTeacher')} removed. They lose their reach over this ${t('group').toLowerCase()}.`
          : `${t('classTeacher')} set.`,
      )
      onSaved()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const rows = staff.data?.rows ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set the ${t('classTeacher').toLowerCase()}`}
      description={`They gain reach over this ${t('group').toLowerCase()} — its roll, its registers and its marks.`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {currentStaffId !== null && (
            <Button
              loading={save.isPending && picked === null}
              onClick={() => {
                setPicked(null)
                save.mutate()
              }}
            >
              Remove {currentName ?? 'the current one'}
            </Button>
          )}
          <Button
            variant="primary"
            loading={save.isPending && picked !== null}
            disabled={picked === null || picked === currentStaffId}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <SearchInput
          value={draft}
          className="w-full"
          placeholder="Name or employee number"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />

        <div className="max-h-72 min-h-[14rem] overflow-y-auto rounded-md border border-gray-200">
          {staff.isLoading ? (
            <div className="space-y-2 p-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<UserCircle size={20} />}
              title={search ? 'Nobody matches that' : 'No staff'}
              description={search ? 'Try part of a name.' : undefined}
            />
          ) : (
            <ul className="p-1">
              {rows.map((member) => {
                const chosen = picked === member.id

                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => setPicked(member.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
                        chosen ? 'bg-rail-active' : 'hover:bg-gray-50',
                      )}
                    >
                      <Avatar name={member.person.full_name} size="sm" className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-gray-900">
                          {member.person.full_name}
                        </span>
                        <span className="block truncate text-2xs text-gray-500">
                          {[member.job_title, member.employee_number].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {chosen && <Check size={14} weight="bold" className="shrink-0 text-gray-900" />}
                    </button>
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
