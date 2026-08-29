import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CalendarBlank, PaperPlaneTilt, Plus, Trash } from '@phosphor-icons/react'
import { formatDate, humanize } from '@/shared/lib/format'
import { PageStack } from '@/shared/layout/AppShell'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  type Column,
  type MenuItemSpec,
} from '@/shared/ui'
import { calendarsApi, type CalendarEntryPayload, type CalendarPayload } from './academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from './academics.keys'
import { FieldRow, FormDialog } from './components/FormDialog'
import { actionsColumn } from './components/RowActions'
import { reportError, useServerErrors } from './components/useServerErrors'
import { useSessionCatalog } from './components/pickers'
import { CALENDAR_ENTRY_KINDS, type CalendarEntry } from './academics.types'

/**
 * Term dates, holidays, exam windows — the year as days rather than as
 * records.
 *
 * ── Two levels, and the second only exists inside the first ────────────────
 *
 * A calendar belongs to a session; entries belong to a calendar. There is no
 * endpoint for "all entries" across calendars, and there should not be —
 * a holiday is only meaningful against the year it falls in. So the page picks
 * a calendar first and everything else is scoped to it.
 *
 * ── Publishing is what makes it visible ────────────────────────────────────
 *
 * `POST /academic-calendars/{id}/publish` is what puts the dates in front of
 * staff, learners and families. A draft calendar is the institution still
 * deciding; the button says so rather than calling it "save".
 */

const calendarSchema = z.object({
  academic_session_id: z.string().min(1, 'Choose a session'),
  name: z.string().trim().min(1, 'Enter a name'),
  starts_on: z.string().optional(),
  ends_on: z.string().optional(),
})

const entrySchema = z.object({
  title: z.string().trim().min(1, 'Enter a title'),
  kind: z.string().min(1, 'Choose a kind'),
  starts_on: z.string().min(1, 'Choose a date'),
  ends_on: z.string().optional(),
  description: z.string().optional(),
})

type CalendarValues = z.infer<typeof calendarSchema>
type EntryValues = z.infer<typeof entrySchema>

export function AcademicCalendarPage() {
  const t = useTerminology()
  const perms = usePermissions()
  const { access } = useTenant()
  const queryClient = useQueryClient()

  const currentSessionId = access?.calendar?.session?.id ?? ''
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingCalendar, setCreatingCalendar] = useState(false)
  const [creatingEntry, setCreatingEntry] = useState(false)

  const canManage = perms.has('academic_calendar.manage')
  const sessions = useSessionCatalog()

  const calendars = useQuery({
    queryKey: academicsKeys.calendars.list({}),
    queryFn: () => calendarsApi.list({ per_page: 100 }),
  })

  const rows = calendars.data?.rows ?? []
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null

  const entries = useQuery({
    queryKey: academicsKeys.calendars.entries(selected?.id ?? ''),
    queryFn: () => calendarsApi.entries(selected!.id),
    enabled: Boolean(selected),
  })

  const calendarForm = useForm<CalendarValues>({
    resolver: zodResolver(calendarSchema),
    defaultValues: { academic_session_id: currentSessionId, name: '', starts_on: '', ends_on: '' },
  })
  const calendarErrors = useServerErrors(calendarForm)

  const entryForm = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { title: '', kind: 'holiday', starts_on: '', ends_on: '', description: '' },
  })
  const entryErrors = useServerErrors(entryForm)

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.calendars.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const saveCalendar = useMutation({
    mutationFn: (values: CalendarValues) => {
      const payload: CalendarPayload = {
        academic_session_id: values.academic_session_id,
        name: values.name.trim(),
        starts_on: values.starts_on || null,
        ends_on: values.ends_on || null,
      }
      return calendarsApi.create(payload)
    },
    onSuccess: (created) => {
      settle('Calendar created')
      setSelectedId(created.id)
      setCreatingCalendar(false)
      calendarForm.reset()
    },
    onError: calendarErrors,
  })

  const saveEntry = useMutation({
    mutationFn: (values: EntryValues) => {
      const payload: CalendarEntryPayload = {
        title: values.title.trim(),
        kind: values.kind,
        starts_on: values.starts_on,
        ends_on: values.ends_on || null,
        description: values.description?.trim() || null,
      }
      return calendarsApi.addEntry(selected!.id, payload)
    },
    onSuccess: () => {
      settle('Entry added')
      setCreatingEntry(false)
      entryForm.reset()
    },
    onError: entryErrors,
  })

  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; message: string }) => run(),
    onSuccess: (_data, variables) => settle(variables.message),
    onError: (error) => reportError(error),
  })

  const entryColumns: Column<CalendarEntry>[] = [
    {
      key: 'title',
      header: 'Entry',
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: 'kind',
      header: 'Kind',
      width: '9rem',
      cell: (row) => <span className="text-gray-700">{humanize(row.kind)}</span>,
    },
    {
      key: 'when',
      header: 'When',
      width: '15rem',
      cell: (row) => (
        <span className="text-gray-700">
          {formatDate(row.starts_on)}
          {row.ends_on && row.ends_on !== row.starts_on ? ` – ${formatDate(row.ends_on)}` : ''}
        </span>
      ),
    },
    actionsColumn<CalendarEntry>(
      (row) => row.title,
      (row) => {
        if (!canManage || !selected) return []
        const items: MenuItemSpec[] = [
          {
            key: 'delete',
            label: 'Remove',
            icon: <Trash size={15} />,
            destructive: true,
            onSelect: () =>
              act.mutate({
                run: () => calendarsApi.removeEntry(selected.id, row.id),
                message: `${row.title} removed`,
              }),
          },
        ]
        return items
      },
    ),
  ]

  return (
    <PageStack>
      <PageHeader
        title="Academic calendar"
        actions={
          canManage ? (
            <Button
              variant="primary"
              trailing={<Plus size={16} weight="bold" />}
              onClick={() => setCreatingCalendar(true)}
            >
              New calendar
            </Button>
          ) : undefined
        }
      />

      {calendars.isError ? (
        <ErrorState error={calendars.error} onRetry={() => calendars.refetch()} />
      ) : rows.length === 0 && !calendars.isLoading ? (
        <Card>
          <EmptyState
            icon={<CalendarBlank size={20} />}
            title="No calendar yet"
            description={`A calendar turns a ${t('session').toLowerCase()} into dates — when term starts, which days are holidays, when exams run. Attendance counts instructional days from it.`}
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setCreatingCalendar(true)}>
                  Create the first calendar
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <Card className="h-fit">
            <CardHeader title="Calendars" />
            <ul className="divide-y divide-gray-200">
              {rows.map((calendar) => (
                <li key={calendar.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(calendar.id)}
                    aria-current={selected?.id === calendar.id ? 'true' : undefined}
                    className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                      selected?.id === calendar.id ? 'bg-gray-50' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{calendar.name}</span>
                    <span className="text-xs text-gray-600">
                      {calendar.academic_session_name ?? '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col gap-4">
            {selected && (
              <Card>
                <CardHeader
                  title={selected.name}
                  subtitle={selected.academic_session_name ?? undefined}
                  actions={
                    <div className="flex items-center gap-2">
                      {selected.published_at ? (
                        <Badge tone="success">Published</Badge>
                      ) : (
                        <StatusBadge status={selected.status ?? 'draft'} />
                      )}
                      {canManage && !selected.published_at && (
                        <Button
                          icon={<PaperPlaneTilt size={14} />}
                          onClick={() =>
                            act.mutate({
                              run: () => calendarsApi.publish(selected.id),
                              message: `${selected.name} published`,
                            })
                          }
                        >
                          Publish
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="primary"
                          trailing={<Plus size={16} weight="bold" />}
                          onClick={() => setCreatingEntry(true)}
                        >
                          Add entry
                        </Button>
                      )}
                    </div>
                  }
                />
                {entries.isError ? (
                  <ErrorState error={entries.error} onRetry={() => entries.refetch()} />
                ) : (
                  <DataTable
                    rows={entries.data ?? []}
                    columns={entryColumns}
                    rowKey={(row) => row.id}
                    loading={entries.isLoading}
                    skeletonRows={3}
                    className="rounded-none border-0"
                    empty={
                      <EmptyState
                        icon={<CalendarBlank size={20} />}
                        title="No dates yet"
                        description="Add term boundaries, holidays and exam windows. Instructional days are counted from what is here."
                      />
                    }
                  />
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      <FormDialog
        open={creatingCalendar}
        onClose={() => setCreatingCalendar(false)}
        title="New calendar"
        description={`One calendar per ${t('session').toLowerCase()}.`}
        form={calendarForm}
        onSubmit={(values) => saveCalendar.mutate(values)}
        pending={saveCalendar.isPending}
        submitLabel="Create"
      >
        <Field
          label={t('session')}
          required
          error={calendarForm.formState.errors.academic_session_id?.message}
        >
          {(props) => (
            <Select
              {...props}
              options={sessions.options}
              placeholder={`Choose a ${t('session').toLowerCase()}`}
              {...calendarForm.register('academic_session_id')}
            />
          )}
        </Field>
        <Field label="Name" required error={calendarForm.formState.errors.name?.message}>
          {(props) => (
            <Input {...props} placeholder="2026/2027 calendar" {...calendarForm.register('name')} />
          )}
        </Field>
        <FieldRow>
          <Field label="Starts on" error={calendarForm.formState.errors.starts_on?.message}>
            {(props) => <Input {...props} type="date" {...calendarForm.register('starts_on')} />}
          </Field>
          <Field label="Ends on" error={calendarForm.formState.errors.ends_on?.message}>
            {(props) => <Input {...props} type="date" {...calendarForm.register('ends_on')} />}
          </Field>
        </FieldRow>
      </FormDialog>

      <FormDialog
        open={creatingEntry}
        onClose={() => setCreatingEntry(false)}
        title="Add an entry"
        form={entryForm}
        onSubmit={(values) => saveEntry.mutate(values)}
        pending={saveEntry.isPending}
        submitLabel="Add"
      >
        <FieldRow>
          <Field label="Title" required error={entryForm.formState.errors.title?.message}>
            {(props) => (
              <Input {...props} placeholder="Mid-term break" {...entryForm.register('title')} />
            )}
          </Field>
          <Field label="Kind" required error={entryForm.formState.errors.kind?.message}>
            {(props) => (
              <Select
                {...props}
                options={CALENDAR_ENTRY_KINDS.map((value) => ({ value, label: humanize(value) }))}
                {...entryForm.register('kind')}
              />
            )}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Starts on" required error={entryForm.formState.errors.starts_on?.message}>
            {(props) => <Input {...props} type="date" {...entryForm.register('starts_on')} />}
          </Field>
          <Field
            label="Ends on"
            hint="Leave blank for a single day"
            error={entryForm.formState.errors.ends_on?.message}
          >
            {(props) => <Input {...props} type="date" {...entryForm.register('ends_on')} />}
          </Field>
        </FieldRow>
        <Field label="Note" error={entryForm.formState.errors.description?.message}>
          {(props) => <Textarea {...props} rows={2} {...entryForm.register('description')} />}
        </Field>
      </FormDialog>
    </PageStack>
  )
}
