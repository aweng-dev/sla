import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarDots, Plus, Trash } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '@/shared/ui'
import { formatDateTime } from '@/shared/lib/format'
import { usePermissions, useTenant } from '@/features/tenant/TenantProvider'
import { reportKeys, reportsApi } from './reports.api'
import type { ReportCadence, ReportFormat, ReportSchedule } from './reports.types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Standing instructions to run this report and email the result. */
export function SchedulesPanel({ reportId }: { reportId: string }) {
  const perms = usePermissions()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)

  const query = useQuery({
    queryKey: reportKeys.schedules(reportId),
    queryFn: () => reportsApi.schedules(reportId),
  })

  const remove = useMutation({
    mutationFn: (scheduleId: string) => reportsApi.removeSchedule(scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.schedules(reportId) })
      toast.success('Schedule removed')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'Could not remove it.'),
  })

  const schedules = query.data ?? []

  return (
    <Card>
      <CardHeader
        title="Scheduled delivery"
        subtitle="Run automatically and email the result."
        actions={
          perms.has('reports.manage') ? (
            <Button size="sm" trailing={<Plus size={16} weight="bold" />} onClick={() => setCreating(true)}>
              Add
            </Button>
          ) : undefined
        }
      />
      <CardBody className="p-0">
        {query.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-12 w-full" />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : schedules.length === 0 ? (
          <EmptyState
            icon={<CalendarDots size={20} />}
            title="Not scheduled"
            description="Nobody is being emailed this report. Add a schedule to have it run and delivered without anyone asking."
          />
        ) : (
          <ul>
            {schedules.map((schedule) => (
              <li
                key={schedule.id}
                className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{cadenceSentence(schedule)}</p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {schedule.recipients.length === 1
                      ? schedule.recipients[0]
                      : `${schedule.recipients.length} recipients`}{' '}
                    · {schedule.format.toUpperCase()}
                  </p>
                  <p className="mt-0.5 text-2xs text-gray-500">
                    {schedule.next_run_at
                      ? `Next ${formatDateTime(schedule.next_run_at, schedule.timezone)}`
                      : 'No next run scheduled'}
                    {schedule.last_run_at
                      ? ` · last ${formatDateTime(schedule.last_run_at, schedule.timezone)}`
                      : ''}
                  </p>
                </div>
                {perms.has('reports.manage') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove this schedule"
                    loading={remove.isPending && remove.variables === schedule.id}
                    onClick={() => remove.mutate(schedule.id)}
                  >
                    <Trash size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <NewScheduleDialog reportId={reportId} open={creating} onClose={() => setCreating(false)} />
    </Card>
  )
}

/** "Every Monday at 07:30 (Africa/Lagos)" — the schedule as a sentence,
 *  because the fields it is assembled from mean nothing individually. */
function cadenceSentence(s: ReportSchedule): string {
  const time = s.time_of_day.slice(0, 5)
  const zone = s.timezone ? ` (${s.timezone})` : ''
  if (s.cadence === 'daily') return `Every day at ${time}${zone}`
  if (s.cadence === 'weekly') return `Every ${DAYS[s.day_of_week ?? 0]} at ${time}${zone}`
  return `Day ${s.day_of_month ?? 1} of each month at ${time}${zone}`
}

function NewScheduleDialog({
  reportId,
  open,
  onClose,
}: {
  reportId: string
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const [cadence, setCadence] = useState<ReportCadence>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [time, setTime] = useState('07:00')
  const [format, setFormat] = useState<ReportFormat>('csv')
  const [recipients, setRecipients] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: () =>
      reportsApi.createSchedule(reportId, {
        cadence,
        day_of_week: cadence === 'weekly' ? Number(dayOfWeek) : null,
        day_of_month: cadence === 'monthly' ? Number(dayOfMonth) : null,
        time_of_day: time,
        timezone: tenant.default_timezone,
        format,
        recipients: parseRecipients(recipients),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.schedules(reportId) })
      toast.success('Scheduled')
      setRecipients('')
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        /* `recipients.0` and friends are per-address; collapse them onto the
         * one textarea rather than dropping them. */
        const merged: Record<string, string> = {}
        for (const [field, message] of Object.entries(error.fieldErrors())) {
          merged[field.startsWith('recipients') ? 'recipients' : field] = message
        }
        setErrors(merged)
        if (Object.keys(merged).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The schedule could not be saved.')
    },
  })

  const addresses = parseRecipients(recipients)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule this report"
      description="It runs with your access, so recipients receive the rows you can see."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={addresses.length === 0}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="How often" error={errors.cadence}>
          {(props) => (
            <Select
              {...props}
              value={cadence}
              onChange={(e) => setCadence(e.target.value as ReportCadence)}
              options={[
                { value: 'daily', label: 'Every day' },
                { value: 'weekly', label: 'Every week' },
                { value: 'monthly', label: 'Every month' },
              ]}
            />
          )}
        </Field>

        {cadence === 'weekly' && (
          <Field label="Day" error={errors.day_of_week}>
            {(props) => (
              <Select
                {...props}
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                options={DAYS.map((label, value) => ({ value: String(value), label }))}
              />
            )}
          </Field>
        )}

        {cadence === 'monthly' && (
          <Field
            label="Day of the month"
            error={errors.day_of_month}
            hint="1 to 28, so the schedule never skips February."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            )}
          </Field>
        )}

        <Field label="Time" error={errors.time_of_day} hint={tenant.default_timezone}>
          {(props) => (
            <Input {...props} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          )}
        </Field>

        <Field label="Format" error={errors.format}>
          {(props) => (
            <Select
              {...props}
              value={format}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'json', label: 'JSON' },
              ]}
            />
          )}
        </Field>

        <Field
          label="Send to"
          required
          error={errors.recipients}
          hint={
            addresses.length > 0
              ? `${addresses.length} address${addresses.length === 1 ? '' : 'es'} · up to 25`
              : 'One address per line, or separated by commas. Up to 25.'
          }
        >
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="bursar@school.example"
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

function parseRecipients(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ]
}
