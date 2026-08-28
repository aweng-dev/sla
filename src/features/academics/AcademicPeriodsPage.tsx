import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle, DotsThree, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { formatDate } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
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
  Select,
  StatusBadge,
  Toolbar,
  type Column,
  type MenuItemSpec,
} from '@/shared/ui'
import { periodsApi, type PeriodPayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { reportError, useServerErrors } from './components/useServerErrors'
import { FilterSelect, useSessionCatalog } from './components/pickers'
import { ACADEMIC_PERIOD_TYPES, type AcademicPeriod } from './academics.types'

/**
 * The divisions of an academic year — terms, semesters, intakes.
 *
 * ── "Period" is the concept; "term" is its kind ────────────────────────────
 *
 * The product says Period uniformly across all three institution
 * vocabularies. What KIND of period an institution runs is a data field
 * (`type`), and `institution.period_label` is what that institution calls one.
 * So the page is titled from `t('periods')` and the type column shows the
 * server's own `type_label` rather than a word this app chose.
 *
 * ── The session filter defaults to the current one ─────────────────────────
 *
 * Periods are meaningless without their session — "First Term" exists once per
 * year — so an unfiltered list of every period the institution has ever run is
 * the wrong first screen. It opens on the current session, and the filter is
 * how somebody reaches an older one.
 */

const schema = z
  .object({
    academic_session_id: z.string().min(1, `Choose a session`),
    name: z.string().trim().min(1, 'Enter a name'),
    code: z.string().trim().max(40).optional(),
    type: z.string().optional(),
    starts_on: z.string().min(1, 'Choose a start date'),
    ends_on: z.string().min(1, 'Choose an end date'),
    sequence: z.string().optional(),
  })
  .refine((v) => !v.starts_on || !v.ends_on || v.starts_on <= v.ends_on, {
    path: ['ends_on'],
    message: 'The end date cannot be before the start date',
  })

type PeriodValues = z.infer<typeof schema>

export function AcademicPeriodsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access } = useTenant()
  const queryClient = useQueryClient()

  const currentSessionId = access?.calendar?.session?.id ?? ''
  const [sessionId, setSessionId] = useState(currentSessionId)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AcademicPeriod | null>(null)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('academic_periods.manage')
  const sessions = useSessionCatalog()

  const listQuery = { academic_session_id: sessionId || undefined, page }

  const query = useQuery({
    queryKey: academicsKeys.periods.list(listQuery),
    queryFn: () => periodsApi.list({ ...listQuery, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const blank: PeriodValues = {
    academic_session_id: sessionId || currentSessionId,
    name: '',
    code: '',
    type: access?.institution.period_terms?.[0] ?? 'term',
    starts_on: '',
    ends_on: '',
    sequence: '',
  }

  const form = useForm<PeriodValues>({ resolver: zodResolver(schema), defaultValues: blank })
  const applyServerErrors = useServerErrors(form)

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.periods.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: PeriodValues) => {
      const payload: PeriodPayload = {
        academic_session_id: values.academic_session_id,
        name: values.name.trim(),
        starts_on: values.starts_on,
        ends_on: values.ends_on,
        code: values.code?.trim() || null,
        type: values.type || null,
        sequence: values.sequence ? Number(values.sequence) : null,
      }
      return editing ? periodsApi.update(editing.id, payload) : periodsApi.create(payload)
    },
    onSuccess: () => {
      settle(editing ? `${t('period')} updated` : `${t('period')} created`)
      close()
    },
    onError: applyServerErrors,
  })

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  function open(period: AcademicPeriod | null) {
    setEditing(period)
    setCreating(period === null)
    form.reset(
      period
        ? {
            academic_session_id: period.academic_session_id,
            name: period.name,
            code: period.code ?? '',
            type: period.type,
            starts_on: period.starts_on,
            ends_on: period.ends_on,
            sequence: String(period.sequence ?? ''),
          }
        : blank,
    )
  }

  function close() {
    setEditing(null)
    setCreating(false)
    form.reset(blank)
  }

  const columns = useMemo<Column<AcademicPeriod>[]>(
    () => [
      {
        key: 'name',
        header: t('period'),
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{row.name}</span>
            {row.is_current && <Badge tone="brand">Current</Badge>}
          </span>
        ),
      },
      {
        key: 'type',
        header: 'Kind',
        width: '8rem',
        /* The server's own label. A school calls this a Term and a university a
         * Semester, and both come from `type_label`. */
        cell: (row) => <span className="text-gray-700">{row.type_label}</span>,
      },
      {
        key: 'session',
        header: t('session'),
        width: '11rem',
        cell: (row) => <span className="text-gray-700">{row.academic_session_name}</span>,
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
        key: 'sequence',
        header: 'Order',
        numeric: true,
        width: '6rem',
        cell: (row) => row.sequence,
      },
      {
        key: 'status',
        header: 'Status',
        width: '8rem',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: 'actions',
        header: '',
        width: '3rem',
        className: 'text-right',
        cell: (row) => {
          if (!canManage || !row.can_manage) return null

          const items: MenuItemSpec[] = [
            { key: 'edit', label: 'Edit', icon: <PencilSimple size={15} />, onSelect: () => open(row) },
          ]

          if (!row.is_current) {
            items.push({
              key: 'current',
              label: 'Make current',
              icon: <CheckCircle size={15} />,
              onSelect: () =>
                act.mutate({
                  run: () => periodsApi.makeCurrent(row.id),
                  message: `${row.name} is now the current ${t('period').toLowerCase()}`,
                }),
            })
          }

          /* No `is_removable` on a period, so the guard is the one thing that
           * certainly blocks deletion: children. The server refuses the rest,
           * and `reportError` shows what it said. */
          if (row.child_count === 0) {
            items.push({
              key: 'delete',
              label: 'Delete',
              icon: <Trash size={15} />,
              destructive: true,
              separated: true,
              onSelect: () =>
                act.mutate({
                  run: () => periodsApi.remove(row.id),
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
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage],
  )

  return (
    <PageStack>
      <PageHeader
        title={t('periods')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => open(null)}
            >
              New {t('period').toLowerCase()}
            </Button>
          ) : undefined
        }
      />

      <Toolbar
        filters={
          <FilterSelect
            value={sessionId}
            onChange={(value) => {
              setSessionId(value)
              setPage(1)
            }}
            options={sessions.options}
            allLabel={`All ${t('sessions').toLowerCase()}`}
            className="w-56"
          />
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            rows={query.data?.rows ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            skeletonRows={4}
            empty={
              <EmptyState
                title={
                  sessionId
                    ? `No ${t('periods').toLowerCase()} in this ${t('session').toLowerCase()}`
                    : `No ${t('periods').toLowerCase()} yet`
                }
                description={`A ${t('session').toLowerCase()} needs at least one ${t('period').toLowerCase()} before it can hold a register or a gradebook.`}
                action={
                  canManage ? (
                    <Button variant="primary" onClick={() => open(null)}>
                      New {t('period').toLowerCase()}
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
        title={editing ? `Edit ${editing.name}` : `New ${t('period').toLowerCase()}`}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel={editing ? 'Save changes' : 'Create'}
      >
        <Field
          label={t('session')}
          required
          error={form.formState.errors.academic_session_id?.message}
        >
          {(props) => (
            <Select
              {...props}
              options={sessions.options}
              placeholder={`Choose a ${t('session').toLowerCase()}`}
              {...form.register('academic_session_id')}
            />
          )}
        </Field>

        <FieldRow>
          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(props) => <Input {...props} placeholder="First Term" {...form.register('name')} />}
          </Field>
          <Field label="Code" error={form.formState.errors.code?.message}>
            {(props) => <Input {...props} placeholder="T1" {...form.register('code')} />}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Kind" error={form.formState.errors.type?.message}>
            {(props) => (
              <Select
                {...props}
                options={ACADEMIC_PERIOD_TYPES.map((value) => ({
                  value,
                  label: value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
                }))}
                {...form.register('type')}
              />
            )}
          </Field>
          <Field
            label="Order"
            hint="Position within the session"
            error={form.formState.errors.sequence?.message}
          >
            {(props) => (
              <Input {...props} type="number" min={1} placeholder="1" {...form.register('sequence')} />
            )}
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
      </FormDialog>
    </PageStack>
  )
}
