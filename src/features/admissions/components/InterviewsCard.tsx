import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, MapPin, Monitor, Phone } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import {
  admissionKeys,
  admissionsApi,
  INTERVIEW_MODE_LABELS,
  type AdmissionInterview,
  type InterviewMode,
  type InterviewStatus,
} from '../admissions.api'

/**
 * Interviews, and what came of them.
 *
 * ── Recording an outcome is not the same as cancelling one ─────────────────
 *
 * `POST .../outcome` takes a status of its own — completed, cancelled, no show —
 * plus the outcome, a score and notes. `DELETE` removes an interview that should
 * never have been booked. The difference matters: a no-show is a fact about the
 * applicant that belongs on the file, and deleting it would hide the one thing
 * an admissions panel would want to know.
 *
 * ── Rescheduling keeps the interview ───────────────────────────────────────
 *
 * A PATCH moves the time. It is not a delete and a re-book, because the second
 * loses whoever was assigned to it and the reason it was arranged.
 */
export function InterviewsCard({
  applicationId,
  canSchedule,
}: {
  applicationId: string
  canSchedule: boolean
}) {
  const queryClient = useQueryClient()
  const [scheduling, setScheduling] = useState(false)
  const [recording, setRecording] = useState<AdmissionInterview | null>(null)

  const interviews = useQuery({
    queryKey: [...admissionKeys.application(applicationId), 'interviews'],
    queryFn: () => admissionsApi.interviews(applicationId),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: admissionKeys.application(applicationId) })
  }

  const rows = interviews.data ?? []

  return (
    <>
      <Card>
        <CardHeader
          title="Interviews"
          subtitle={
            rows.length === 0
              ? 'None arranged'
              : `${formatNumber(rows.length)} ${rows.length === 1 ? 'interview' : 'interviews'}`
          }
          actions={
            canSchedule ? (
              <Button
                size="sm"
                icon={<CalendarPlus size={14} />}
                onClick={() => setScheduling(true)}
              >
                Schedule
              </Button>
            ) : undefined
          }
        />

        {interviews.isError ? (
          <ErrorState error={interviews.error} onRetry={() => interviews.refetch()} />
        ) : interviews.isLoading ? (
          <div className="space-y-2 p-4" aria-hidden>
            <Skeleton className="h-12 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-500">
            Nothing is booked. An interview can be in person, online or by phone.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {rows.map((interview) => (
              <li key={interview.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0 text-gray-500" aria-hidden>
                  {interview.mode === 'online' ? (
                    <Monitor size={15} />
                  ) : interview.mode === 'phone' ? (
                    <Phone size={15} />
                  ) : (
                    <MapPin size={15} />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    {formatDateTime(interview.scheduled_at)}
                    {interview.duration_minutes && (
                      <span className="text-gray-500"> · {interview.duration_minutes} min</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-2xs text-gray-600">
                    {INTERVIEW_MODE_LABELS[interview.mode]}
                    {interview.location && ` · ${interview.location}`}
                    {interview.outcome && ` · ${interview.outcome}`}
                    {interview.score !== null && ` · scored ${formatNumber(interview.score)}`}
                  </p>
                  {interview.notes && (
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-600">
                      {interview.notes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={interview.status} />
                  {canSchedule && interview.status === 'scheduled' && (
                    <Button size="sm" variant="ghost" onClick={() => setRecording(interview)}>
                      Outcome
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ScheduleDialog
        open={scheduling}
        applicationId={applicationId}
        onClose={() => setScheduling(false)}
        onSaved={() => {
          setScheduling(false)
          refresh()
        }}
      />

      <OutcomeDialog
        interview={recording}
        applicationId={applicationId}
        onClose={() => setRecording(null)}
        onSaved={() => {
          setRecording(null)
          refresh()
        }}
      />
    </>
  )
}

function ScheduleDialog({
  open,
  applicationId,
  onClose,
  onSaved,
}: {
  open: boolean
  applicationId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState('30')
  const [mode, setMode] = useState<InterviewMode>('in_person')
  const [location, setLocation] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () =>
      admissionsApi.scheduleInterview(applicationId, {
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: duration.trim() === '' ? undefined : Number(duration),
        mode,
        location: location.trim() || undefined,
      }),
    onSuccess: () => {
      setScheduledAt('')
      setLocation('')
      setErrors({})
      toast.success('Interview scheduled.')
      onSaved()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That interview was not scheduled.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule an interview"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={scheduledAt === ''}
            onClick={() => save.mutate()}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="When" required error={errors.scheduled_at}>
          {(props) => (
            <Input
              {...props}
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.currentTarget.value)}
            />
          )}
        </Field>

        <div className="grid gap-1 sm:grid-cols-2">
          <Field label="Minutes" error={errors.duration_minutes}>
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.currentTarget.value)}
              />
            )}
          </Field>

          <Field label="How" error={errors.mode}>
            {(props) => (
              <Select
                {...props}
                value={mode}
                onChange={(event) => setMode(event.currentTarget.value as InterviewMode)}
                options={(Object.keys(INTERVIEW_MODE_LABELS) as InterviewMode[]).map((key) => ({
                  value: key,
                  label: INTERVIEW_MODE_LABELS[key],
                }))}
              />
            )}
          </Field>
        </div>

        <Field
          label={mode === 'online' ? 'Link' : mode === 'phone' ? 'Number' : 'Where'}
          error={errors.location}
        >
          {(props) => (
            <Input
              {...props}
              value={location}
              maxLength={255}
              onChange={(event) => setLocation(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

function OutcomeDialog({
  interview,
  applicationId,
  onClose,
  onSaved,
}: {
  interview: AdmissionInterview | null
  applicationId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState<InterviewStatus>('completed')
  const [outcome, setOutcome] = useState('')
  const [score, setScore] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () =>
      admissionsApi.recordOutcome(applicationId, interview!.id, {
        status,
        outcome: outcome.trim() || undefined,
        score: score.trim() === '' ? undefined : Number(score),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      setOutcome('')
      setScore('')
      setNotes('')
      setErrors({})
      toast.success('Outcome recorded.')
      onSaved()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That outcome was not recorded.')
    },
  })

  return (
    <Modal
      open={interview !== null}
      onClose={onClose}
      title="Record the outcome"
      description="A no-show is recorded, not deleted — it is part of the file."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="What happened" required error={errors.status}>
          {(props) => (
            <Select
              {...props}
              value={status}
              onChange={(event) => setStatus(event.currentTarget.value as InterviewStatus)}
              options={[
                { value: 'completed', label: 'It happened' },
                { value: 'no_show', label: 'They did not come' },
                { value: 'cancelled', label: 'It was cancelled' },
              ]}
            />
          )}
        </Field>

        {status === 'completed' && (
          <div className="grid gap-1 sm:grid-cols-2">
            <Field label="Outcome" error={errors.outcome}>
              {(props) => (
                <Input
                  {...props}
                  value={outcome}
                  maxLength={255}
                  onChange={(event) => setOutcome(event.currentTarget.value)}
                />
              )}
            </Field>

            <Field label="Score" error={errors.score}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="decimal"
                  value={score}
                  onChange={(event) => setScore(event.currentTarget.value)}
                />
              )}
            </Field>
          </div>
        )}

        <Field label="Notes" error={errors.notes}>
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={notes}
              maxLength={2000}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
