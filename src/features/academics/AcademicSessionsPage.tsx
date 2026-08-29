import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Archive,
  ArrowCounterClockwise,
  CheckCircle,
  DotsThree,
  Lock,
  LockOpen,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { formatDate, formatNumber } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Menu,
  PageHeader,
  Pagination,
  StatusBadge,
  type Column,
  type MenuItemSpec,
} from '@/shared/ui'
import { sessionsApi, type SessionPayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { reportError, useServerErrors } from './components/useServerErrors'
import type { AcademicSession } from './academics.types'

/**
 * The academic years an institution runs.
 *
 * ── The vocabulary ─────────────────────────────────────────────────────────
 *
 * "Session" is the product's word for the academic year in all three
 * institution vocabularies, and its divisions are "Periods". Never "Term" or
 * "Academic year" as a concept name — a term is one KIND of period, which is a
 * data field. Everything user-facing here goes through `useTerminology()`.
 *
 * ── Why the row menu is not a status dropdown ──────────────────────────────
 *
 * Opening, closing, archiving, reopening and making-current are five distinct
 * POST endpoints, not five values of one column. Closing a session runs domain
 * work; archiving is a different question from closing; and exactly one session
 * is current at a time, which the server enforces by clearing the previous one.
 * A `status` select would imply they are interchangeable and would let a
 * reader pick a transition the server will refuse.
 *
 * Each item is drawn only when it applies — `is_open` decides open vs close,
 * `is_removable` decides whether Delete appears at all. The server is the
 * authority on both, and a button drawn against a false `is_removable` is a
 * button that answers 409.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  code: z.string().trim().max(40, 'Keep the code under 40 characters').optional(),
  starts_on: z.string().min(1, 'Choose a start date'),
  ends_on: z.string().min(1, 'Choose an end date'),
  registration_starts_on: z.string().optional(),
  registration_ends_on: z.string().optional(),
})

type SessionValues = z.infer<typeof schema>

const BLANK: SessionValues = {
  name: '',
  code: '',
  starts_on: '',
  ends_on: '',
  registration_starts_on: '',
  registration_ends_on: '',
}

/**
 * `embedded` renders this inside Settings, which supplies the page title and
 * the description itself — so the screen drops its own `PageHeader` and keeps
 * only the action that belongs to it. It is the same component either way;
 * there is no second implementation for the settings copy to drift from.
 */
export function AcademicSessionsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTerminology()
  const perms = usePermissions()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AcademicSession | null>(null)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('academic_sessions.manage')

  const query = useQuery({
    queryKey: academicsKeys.sessions.list({ page }),
    queryFn: () => sessionsApi.list({ page, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const form = useForm<SessionValues>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const applyServerErrors = useServerErrors(form)

  /* A write to a session changes what nearly every other academic row prints —
   * `academic_session_name` is denormalised onto groups, offerings and
   * enrolments, and the current session is the caption in the rail. */
  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.sessions.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: SessionValues) => {
      const payload: SessionPayload = {
        name: values.name.trim(),
        starts_on: values.starts_on,
        ends_on: values.ends_on,
        code: values.code?.trim() || null,
        registration_starts_on: values.registration_starts_on || null,
        registration_ends_on: values.registration_ends_on || null,
      }
      return editing ? sessionsApi.update(editing.id, payload) : sessionsApi.create(payload)
    },
    onSuccess: () => {
      settle(editing ? `${t('session')} updated` : `${t('session')} created`)
      close()
    },
    onError: applyServerErrors,
  })

  /** Every lifecycle transition, through one mutation. They differ only in
   *  which endpoint they call and what to say afterwards. */
  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  function open(session: AcademicSession | null) {
    setEditing(session)
    setCreating(session === null)
    form.reset(
      session
        ? {
            name: session.name,
            code: session.code ?? '',
            starts_on: session.starts_on,
            ends_on: session.ends_on,
            registration_starts_on: session.registration_starts_on ?? '',
            registration_ends_on: session.registration_ends_on ?? '',
          }
        : BLANK,
    )
  }

  function close() {
    setEditing(null)
    setCreating(false)
    form.reset(BLANK)
  }

  const columns = useMemo<Column<AcademicSession>[]>(
    () => [
      {
        key: 'name',
        header: t('session'),
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{row.name}</span>
            {row.is_current && <Badge tone="brand">Current</Badge>}
          </span>
        ),
      },
      {
        key: 'code',
        header: 'Code',
        width: '9rem',
        cell: (row) => <span className="tabular text-gray-700">{row.code ?? '—'}</span>,
      },
      {
        key: 'runs',
        header: 'Runs',
        width: '15rem',
        cell: (row) => (
          <span className="text-gray-700">
            {formatDate(row.starts_on)} – {formatDate(row.ends_on)}
          </span>
        ),
      },
      {
        key: 'periods',
        header: t('periods'),
        numeric: true,
        width: '7rem',
        cell: (row) => formatNumber(row.period_count),
      },
      {
        key: 'status',
        header: 'Status',
        width: '9rem',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: 'enrolment',
        header: 'Enrolment',
        width: '8rem',
        /* `is_open` is a different question from `status`: a session can be
         * active and closed to new enrolment. Both are shown because a
         * registrar acts on the second. */
        cell: (row) => (
          <span className="text-gray-700">{row.is_open ? 'Open' : 'Closed'}</span>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '3rem',
        className: 'text-right',
        cell: (row) => <RowMenu row={row} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, act.isPending],
  )

  function RowMenu({ row }: { row: AcademicSession }) {
    if (!canManage || !row.can_manage) return null

    const items: MenuItemSpec[] = [
      {
        key: 'edit',
        label: 'Edit',
        icon: <PencilSimple size={15} />,
        onSelect: () => open(row),
      },
    ]

    if (!row.is_current) {
      items.push({
        key: 'current',
        label: 'Make current',
        icon: <CheckCircle size={15} />,
        onSelect: () =>
          act.mutate({
            run: () => sessionsApi.makeCurrent(row.id),
            message: `${row.name} is now the current ${t('session').toLowerCase()}`,
          }),
      })
    }

    items.push(
      row.is_open
        ? {
            key: 'close',
            label: 'Close enrolment',
            icon: <Lock size={15} />,
            separated: true,
            onSelect: () =>
              act.mutate({
                run: () => sessionsApi.close(row.id),
                message: `Enrolment closed for ${row.name}`,
              }),
          }
        : {
            key: 'open',
            label: 'Open enrolment',
            icon: <LockOpen size={15} />,
            separated: true,
            onSelect: () =>
              act.mutate({
                run: () => sessionsApi.open(row.id),
                message: `Enrolment open for ${row.name}`,
              }),
          },
    )

    items.push(
      row.status === 'archived'
        ? {
            key: 'reopen',
            label: 'Reopen',
            icon: <ArrowCounterClockwise size={15} />,
            onSelect: () =>
              act.mutate({
                run: () => sessionsApi.reopen(row.id),
                message: `${row.name} reopened`,
              }),
          }
        : {
            key: 'archive',
            label: 'Archive',
            icon: <Archive size={15} />,
            onSelect: () =>
              act.mutate({
                run: () => sessionsApi.archive(row.id),
                message: `${row.name} archived`,
              }),
          },
    )

    /* Only when the server says so. A session with periods, groups or
     * enrolments hanging off it is not removable however much permission the
     * reader holds. */
    if (row.is_removable) {
      items.push({
        key: 'delete',
        label: 'Delete',
        icon: <Trash size={15} />,
        destructive: true,
        separated: true,
        onSelect: () =>
          act.mutate({
            run: () => sessionsApi.remove(row.id),
            message: `${row.name} deleted`,
          }),
      })
    }

    return (
      <Menu
        items={items}
        trigger={({ toggle, ref }) => (
          <button
            ref={ref as never}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggle()
            }}
            aria-label={`Actions for ${row.name}`}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <DotsThree size={16} weight="bold" />
          </button>
        )}
      />
    )
  }

  const rows = query.data?.rows ?? []

  return (
    <PageStack className={embedded ? 'gap-4' : undefined}>
      {embedded ? (
        <div className="-mt-1 flex justify-end">{canManage ? (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => open(null)}
            >
              New {t('session').toLowerCase()}
            </Button>
          ) : undefined}</div>
      ) : (
      <PageHeader
        title={t('sessions')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => open(null)}
            >
              New {t('session').toLowerCase()}
            </Button>
          ) : undefined
        }
        />
      )}

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={4}
            empty={
              <EmptyState
                title={`No ${t('sessions').toLowerCase()} yet`}
                description={`An institution needs at least one ${t('session').toLowerCase()} before anyone can be enrolled, timetabled or assessed.`}
                action={
                  canManage ? (
                    <Button variant="primary" onClick={() => open(null)}>
                      New {t('session').toLowerCase()}
                    </Button>
                  ) : undefined
                }
              />
            }
          />
          {query.data && <Pagination pagination={query.data.pagination} onPageChange={setPage} />}
        </>
      )}

      <FormDialog
        open={creating || editing !== null}
        onClose={close}
        title={editing ? `Edit ${editing.name}` : `New ${t('session').toLowerCase()}`}
        description={
          editing
            ? undefined
            : `Give it a name and the dates it runs between. ${t('periods')} come after.`
        }
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel={editing ? 'Save changes' : `Create ${t('session').toLowerCase()}`}
      >
        <FieldRow>
          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(props) => <Input {...props} placeholder="2026/2027" {...form.register('name')} />}
          </Field>
          <Field
            label="Code"
            hint="Optional short reference"
            error={form.formState.errors.code?.message}
          >
            {(props) => <Input {...props} placeholder="SES-2026" {...form.register('code')} />}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Starts on" required error={form.formState.errors.starts_on?.message}>
            {(props) => <Input {...props} type="date" {...form.register('starts_on')} />}
          </Field>
          <Field label="Ends on" required error={form.formState.errors.ends_on?.message}>
            {(props) => <Input {...props} type="date" {...form.register('ends_on')} />}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field
            label="Registration opens"
            hint="Leave blank to follow the session"
            error={form.formState.errors.registration_starts_on?.message}
          >
            {(props) => (
              <Input {...props} type="date" {...form.register('registration_starts_on')} />
            )}
          </Field>
          <Field
            label="Registration closes"
            error={form.formState.errors.registration_ends_on?.message}
          >
            {(props) => <Input {...props} type="date" {...form.register('registration_ends_on')} />}
          </Field>
        </FieldRow>
      </FormDialog>
    </PageStack>
  )
}
