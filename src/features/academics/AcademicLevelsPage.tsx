import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Archive, CaretRight, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { PER_PAGE_DEFAULT } from '@/shared/api/client'
import { humanize } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Tabs,
  panelId,
  type Column,
  type MenuItemSpec,
} from '@/shared/ui'
import { levelsApi, type LevelPayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { actionsColumn } from './components/RowActions'
import { reportError, useServerErrors } from './components/useServerErrors'
import type { AcademicLevel, AcademicLevelNode } from './academics.types'

/**
 * The rungs a learner climbs — year groups, forms, stages.
 *
 * ── Two views of one thing ─────────────────────────────────────────────────
 *
 * Levels nest: a stage holds years, a year holds forms. The flat list is what
 * you edit and page through; the tree is what tells you the shape. Both read
 * the same records, from two endpoints the API provides for exactly this
 * reason (`/academic-levels` and `/academic-levels/tree`), so neither is
 * derived in the client from the other.
 *
 * ── `type` is a free label, not an enum ────────────────────────────────────
 *
 * The API validates it as `string|max:80`. A school says "year", a university
 * says "stage", a training provider says "cohort". So the field offers the
 * values already in use in this institution — real data, not a list this app
 * invented — while still accepting anything typed.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  code: z.string().trim().min(1, 'Enter a code'),
  type: z.string().trim().optional(),
  parent_id: z.string().optional(),
  sequence: z.string().optional(),
})

type LevelValues = z.infer<typeof schema>

const BLANK: LevelValues = { name: '', code: '', type: '', parent_id: '', sequence: '' }

export function AcademicLevelsPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const queryClient = useQueryClient()

  const [view, setView] = useState<'list' | 'tree'>('list')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AcademicLevel | null>(null)
  const [creating, setCreating] = useState(false)

  const canManage = perms.has('academic_levels.manage')
  const viewId = 'levels-view'

  const listQuery = { page }

  const query = useQuery({
    queryKey: academicsKeys.levels.list(listQuery),
    queryFn: () => levelsApi.list({ ...listQuery, per_page: PER_PAGE_DEFAULT }),
    placeholderData: (previous) => previous,
  })

  const tree = useQuery({
    queryKey: academicsKeys.levels.tree(),
    queryFn: levelsApi.tree,
    enabled: view === 'tree',
  })

  const rows = query.data?.rows ?? []

  /** Parent options and type suggestions both come from what exists. A level
   *  cannot be its own parent, so the row being edited is excluded. */
  const parentOptions = useMemo(
    () =>
      rows
        .filter((row) => row.id !== editing?.id)
        .map((row) => ({ value: row.id, label: `${row.name} · ${row.code}` })),
    [rows, editing],
  )

  const typeSuggestions = useMemo(
    () => [...new Set(rows.map((row) => row.type).filter((v): v is string => Boolean(v)))],
    [rows],
  )

  const form = useForm<LevelValues>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const applyServerErrors = useServerErrors(form)

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.levels.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: LevelValues) => {
      const payload: LevelPayload = {
        name: values.name.trim(),
        code: values.code.trim(),
        type: values.type?.trim() || null,
        parent_id: values.parent_id || null,
        sequence: values.sequence ? Number(values.sequence) : null,
      }
      return editing ? levelsApi.update(editing.id, payload) : levelsApi.create(payload)
    },
    onSuccess: () => {
      settle(editing ? `${t('level')} updated` : `${t('level')} created`)
      close()
    },
    onError: applyServerErrors,
  })

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  function open(level: AcademicLevel | null) {
    setEditing(level)
    setCreating(level === null)
    form.reset(
      level
        ? {
            name: level.name,
            code: level.code,
            type: level.type ?? '',
            parent_id: level.parent_id ?? '',
            sequence: String(level.sequence ?? ''),
          }
        : BLANK,
    )
  }

  function close() {
    setEditing(null)
    setCreating(false)
    form.reset(BLANK)
  }

  function menuFor(row: AcademicLevel): MenuItemSpec[] {
    if (!canManage) return []

    const items: MenuItemSpec[] = [
      { key: 'edit', label: 'Edit', icon: <PencilSimple size={15} />, onSelect: () => open(row) },
    ]

    if (row.status !== 'archived') {
      items.push({
        key: 'archive',
        label: 'Archive',
        icon: <Archive size={15} />,
        onSelect: () =>
          act.mutate({ run: () => levelsApi.archive(row.id), message: `${row.name} archived` }),
      })
    }

    /* A level with children beneath it cannot go; the records under it would
     * lose their place in the ladder. */
    if (row.child_count === 0) {
      items.push({
        key: 'delete',
        label: 'Delete',
        icon: <Trash size={15} />,
        destructive: true,
        separated: true,
        onSelect: () =>
          act.mutate({ run: () => levelsApi.remove(row.id), message: `${row.name} deleted` }),
      })
    }

    return items
  }

  const columns = useMemo<Column<AcademicLevel>[]>(
    () => [
      {
        key: 'name',
        header: t('level'),
        cell: (row) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: 'code',
        header: 'Code',
        width: '9rem',
        cell: (row) => <span className="tabular text-gray-700">{row.code}</span>,
      },
      {
        key: 'type',
        header: 'Kind',
        width: '8rem',
        cell: (row) => <span className="text-gray-700">{humanize(row.type)}</span>,
      },
      {
        key: 'parent',
        header: 'Sits under',
        width: '11rem',
        cell: (row) => <span className="text-gray-700">{row.parent_name ?? '—'}</span>,
      },
      { key: 'sequence', header: 'Order', numeric: true, width: '6rem', cell: (row) => row.sequence },
      {
        key: 'status',
        header: 'Status',
        width: '8rem',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      actionsColumn<AcademicLevel>((row) => row.name, menuFor),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, rows],
  )

  return (
    <PageStack>
      <PageHeader
        title={t('levels')}
        description={`The rungs a ${t('learner').toLowerCase()} climbs. Classes, programmes and progression all hang off these.`}
        actions={
          canManage ? (
            <Button
              variant="primary"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => open(null)}
            >
              New {t('level').toLowerCase()}
            </Button>
          ) : undefined
        }
      />

      <Tabs
        baseId={viewId}
        value={view}
        onChange={(key) => setView(key as 'list' | 'tree')}
        items={[
          { key: 'list', label: 'All', count: query.data?.pagination.total },
          { key: 'tree', label: 'Hierarchy' },
        ]}
      />

      <div
        role="tabpanel"
        id={panelId(viewId, view)}
        aria-labelledby={`${viewId}-tab-${view}`}
        className="flex flex-col gap-4"
      >
        {view === 'list' &&
          (query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <>
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(row) => row.id}
                loading={query.isLoading}
                skeletonRows={5}
                empty={
                  <EmptyState
                    title={`No ${t('levels').toLowerCase()} yet`}
                    description={`Add the year groups or stages this institution teaches. Classes and progression are arranged around them.`}
                    action={
                      canManage ? (
                        <Button variant="primary" onClick={() => open(null)}>
                          New {t('level').toLowerCase()}
                        </Button>
                      ) : undefined
                    }
                  />
                }
              />
              {query.data && (
                <Pagination pagination={query.data.pagination} onPageChange={setPage} />
              )}
            </>
          ))}

        {view === 'tree' &&
          (tree.isError ? (
            <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
          ) : (
            <Card className="p-2">
              {tree.isLoading && <p className="px-3 py-6 text-sm text-gray-600">Loading…</p>}
              {!tree.isLoading && (tree.data ?? []).length === 0 && (
                <EmptyState
                  title="Nothing to show"
                  description={`Add a ${t('level').toLowerCase()} and the hierarchy appears here.`}
                />
              )}
              {(tree.data ?? []).map((node) => (
                <TreeRow key={node.id} node={node} depth={0} />
              ))}
            </Card>
          ))}
      </div>

      <FormDialog
        open={creating || editing !== null}
        onClose={close}
        title={editing ? `Edit ${editing.name}` : `New ${t('level').toLowerCase()}`}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        submitLabel={editing ? 'Save changes' : 'Create'}
      >
        <FieldRow>
          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(props) => <Input {...props} placeholder="JSS 1" {...form.register('name')} />}
          </Field>
          <Field label="Code" required error={form.formState.errors.code?.message}>
            {(props) => <Input {...props} placeholder="JSS1" {...form.register('code')} />}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field
            label="Kind"
            hint="A free label — year, stage, cohort"
            error={form.formState.errors.type?.message}
          >
            {(props) => (
              <>
                <Input {...props} list="level-types" placeholder="year" {...form.register('type')} />
                <datalist id="level-types">
                  {typeSuggestions.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field
            label="Order"
            hint="Position among its siblings"
            error={form.formState.errors.sequence?.message}
          >
            {(props) => (
              <Input {...props} type="number" min={1} placeholder="1" {...form.register('sequence')} />
            )}
          </Field>
        </FieldRow>

        <Field
          label="Sits under"
          hint="Leave blank for a top-level rung"
          error={form.formState.errors.parent_id?.message}
        >
          {(props) => (
            <Select
              {...props}
              options={[{ value: '', label: 'Nothing — top level' }, ...parentOptions]}
              {...form.register('parent_id')}
            />
          )}
        </Field>
      </FormDialog>
    </PageStack>
  )
}

/** One node and everything beneath it. Indented rather than collapsible: a
 *  ladder is short, and hiding rungs behind a disclosure makes the shape —
 *  the only reason to look at this view — harder to see. */
function TreeRow({ node, depth }: { node: AcademicLevelNode; depth: number }) {
  return (
    <>
      <div
        className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-gray-50"
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        {depth > 0 && <CaretRight size={11} className="shrink-0 text-gray-400" aria-hidden />}
        <span className={cn('text-sm', depth === 0 ? 'font-medium text-gray-900' : 'text-gray-800')}>
          {node.name}
        </span>
        <span className="tabular text-xs text-gray-500">{node.code}</span>
        {node.status !== 'active' && <StatusBadge status={node.status} />}
      </div>
      {node.children.map((child) => (
        <TreeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  )
}
