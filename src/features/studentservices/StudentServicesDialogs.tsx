import { useEffect } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { Button, Field, Input, Modal, Select, Switch, Textarea } from '@/shared/ui'
import { disciplineApi, healthApi, studentServicesKeys } from './studentServices.api'
import {
  CONDITION_KINDS,
  CONDITION_SEVERITIES,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
} from './studentServices.types'

function present(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function mapErrors<T extends Record<string, unknown>>(
  error: unknown,
  setError: (name: FieldPath<T>, e: { message: string }) => void,
  fallback: string,
) {
  if (!(error instanceof ApiError)) {
    toast.error(fallback)
    return
  }
  const fields = error.fieldErrors()
  for (const [field, message] of Object.entries(fields)) {
    setError(field as FieldPath<T>, { message })
  }
  if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
}

/* ── A health condition ──────────────────────────────────────────────────── */

const conditionSchema = z
  .object({
    kind: z.enum(CONDITION_KINDS),
    name: z.string().trim().min(1, 'Name the condition').max(150),
    severity: z.enum(CONDITION_SEVERITIES),
    is_emergency_relevant: z.boolean(),
    emergency_action: z.string().trim().max(250),
    notes: z.string().trim().max(20000),
    diagnosed_on: z.string(),
  })
  .refine(
    (v) => !v.is_emergency_relevant || v.emergency_action.trim() !== '',
    {
      path: ['emergency_action'],
      /* A condition on the emergency card with no action tells the adult
       * holding the child that something is wrong and nothing about what to
       * do. That is worse than not flagging it. */
      message: 'Say what to do, if this goes on the emergency card',
    },
  )

type ConditionValues = z.infer<typeof conditionSchema>

export function ConditionDialog({
  open,
  onClose,
  profileId,
  studentId,
}: {
  open: boolean
  onClose: () => void
  profileId: string
  studentId: string
}) {
  const queryClient = useQueryClient()
  const form = useForm<ConditionValues>({
    resolver: zodResolver(conditionSchema),
    defaultValues: {
      kind: 'allergy',
      name: '',
      severity: 'moderate',
      is_emergency_relevant: true,
      emergency_action: '',
      notes: '',
      diagnosed_on: '',
    },
  })
  const { formState, handleSubmit, register, reset, setError, setValue, watch } = form

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const save = useMutation({
    mutationFn: (values: ConditionValues) =>
      healthApi.addCondition(profileId, {
        kind: values.kind,
        name: values.name.trim(),
        severity: values.severity,
        is_emergency_relevant: values.is_emergency_relevant,
        emergency_action: present(values.emergency_action) ?? null,
        notes: present(values.notes) ?? null,
        diagnosed_on: present(values.diagnosed_on) ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentServicesKeys.conditions(profileId) })
      /* The card shows the conditions flagged for it, so a new one changes
       * the card as well as the file. */
      queryClient.invalidateQueries({ queryKey: studentServicesKeys.emergency(studentId) })
      toast.success('Condition recorded')
      onClose()
    },
    onError: (error) => mapErrors<ConditionValues>(error, setError, 'The condition could not be saved.'),
  })

  const flagged = watch('is_emergency_relevant')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a condition"
      description="Allergies, ongoing conditions, dietary needs and medications."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>
            Record condition
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-1" noValidate>
        <Field label="Name" required error={formState.errors.name?.message}>
          {(props) => <Input {...props} placeholder="Peanut allergy" autoFocus {...register('name')} />}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Kind" error={formState.errors.kind?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('kind')}
                options={CONDITION_KINDS.map((k) => ({
                  value: k,
                  label: k.charAt(0).toUpperCase() + k.slice(1),
                }))}
              />
            )}
          </Field>
          <Field label="Severity" error={formState.errors.severity?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('severity')}
                options={CONDITION_SEVERITIES.map((s) => ({
                  value: s,
                  label: s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
                }))}
              />
            )}
          </Field>
        </div>

        <label className="flex items-start gap-2.5 py-1.5">
          <Switch
            checked={flagged}
            onChange={(next) => setValue('is_emergency_relevant', next, { shouldDirty: true })}
            label="Show on the emergency card"
          />
          <span className="text-sm text-gray-800">
            Show on the emergency card
            <span className="block text-xs text-gray-600">
              Anyone who teaches or cares for this child will see it.
            </span>
          </span>
        </label>

        {flagged && (
          <Field
            label="What to do"
            required
            hint="The instruction an adult acts on, in one line."
            error={formState.errors.emergency_action?.message}
          >
            {(props) => (
              <Input {...props} placeholder="Use the EpiPen in the office, then call 112" {...register('emergency_action')} />
            )}
          </Field>
        )}

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Diagnosed on" error={formState.errors.diagnosed_on?.message}>
            {(props) => <Input {...props} type="date" {...register('diagnosed_on')} />}
          </Field>
        </div>

        <Field label="Notes" error={formState.errors.notes?.message}>
          {(props) => <Textarea {...props} rows={2} {...register('notes')} />}
        </Field>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}

/* ── The profile itself ──────────────────────────────────────────────────── */

const profileSchema = z.object({
  blood_group: z.string().trim().max(12),
  emergency_contact_name: z.string().trim().max(150),
  emergency_contact_relationship: z.string().trim().max(60),
  emergency_contact_phone: z.string().trim().max(40),
  consent_to_emergency_treatment: z.boolean(),
})

type ProfileValues = z.infer<typeof profileSchema>

export function HealthProfileDialog({
  open,
  onClose,
  profileId,
}: {
  open: boolean
  onClose: () => void
  profileId: string
}) {
  const queryClient = useQueryClient()
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      blood_group: '',
      emergency_contact_name: '',
      emergency_contact_relationship: '',
      emergency_contact_phone: '',
      consent_to_emergency_treatment: false,
    },
  })
  const { formState, handleSubmit, register, setError, setValue, watch } = form

  const save = useMutation({
    mutationFn: (values: ProfileValues) =>
      healthApi.updateProfile(profileId, {
        blood_group: present(values.blood_group) ?? null,
        emergency_contact_name: present(values.emergency_contact_name) ?? null,
        emergency_contact_relationship: present(values.emergency_contact_relationship) ?? null,
        emergency_contact_phone: present(values.emergency_contact_phone) ?? null,
        consent_to_emergency_treatment: values.consent_to_emergency_treatment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentServicesKeys.all })
      toast.success('Card updated')
      onClose()
    },
    onError: (error) => mapErrors<ProfileValues>(error, setError, 'The card could not be saved.'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Emergency card"
      description="What anyone caring for this child will see."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>
            Save card
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-1" noValidate>
        <Field label="Blood group" error={formState.errors.blood_group?.message}>
          {(props) => <Input {...props} placeholder="O+" {...register('blood_group')} />}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Emergency contact" error={formState.errors.emergency_contact_name?.message}>
            {(props) => <Input {...props} {...register('emergency_contact_name')} />}
          </Field>
          <Field label="Relationship" error={formState.errors.emergency_contact_relationship?.message}>
            {(props) => <Input {...props} placeholder="Mother" {...register('emergency_contact_relationship')} />}
          </Field>
        </div>
        <Field label="Phone" error={formState.errors.emergency_contact_phone?.message}>
          {(props) => <Input {...props} type="tel" {...register('emergency_contact_phone')} />}
        </Field>
        <label className="flex items-start gap-2.5 py-1.5">
          <Switch
            checked={watch('consent_to_emergency_treatment')}
            onChange={(next) => setValue('consent_to_emergency_treatment', next, { shouldDirty: true })}
            label="Consent to emergency treatment"
          />
          <span className="text-sm text-gray-800">Consent to emergency treatment</span>
        </label>
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}

/* ── Filing an incident ──────────────────────────────────────────────────── */

const incidentSchema = z.object({
  occurred_at: z.string().min(1, 'When did it happen?'),
  summary: z.string().trim().min(1, 'Summarise it in one line').max(250),
  description: z.string().trim().max(10000),
  category: z.enum(INCIDENT_CATEGORIES),
  severity: z.enum(INCIDENT_SEVERITIES),
  location: z.string().trim().max(150),
  is_confidential: z.boolean(),
  subject_student_id: z.string().min(1, 'Name the learner this concerns'),
  statement: z.string().trim().max(10000),
})

type IncidentValues = z.infer<typeof incidentSchema>

export function IncidentDialog({
  open,
  onClose,
  student,
}: {
  open: boolean
  onClose: () => void
  student: { id: string; name: string } | null
}) {
  const queryClient = useQueryClient()
  const form = useForm<IncidentValues>({
    resolver: zodResolver(incidentSchema),
    defaultValues: {
      occurred_at: '',
      summary: '',
      description: '',
      category: 'conduct',
      severity: 'minor',
      location: '',
      is_confidential: false,
      subject_student_id: '',
      statement: '',
    },
  })
  const { formState, handleSubmit, register, reset, setError, setValue, watch } = form

  useEffect(() => {
    if (!open) return
    reset()
    if (student) setValue('subject_student_id', student.id)
  }, [open, student, reset, setValue])

  const save = useMutation({
    mutationFn: (values: IncidentValues) =>
      disciplineApi.fileIncident({
        occurred_at: values.occurred_at,
        summary: values.summary.trim(),
        description: present(values.description) ?? null,
        category: values.category,
        severity: values.severity,
        location: present(values.location) ?? null,
        is_confidential: values.is_confidential,
        /* The API requires at least one party and the subject is the one that
         * makes an incident about somebody. Witnesses and statements are added
         * from the incident itself, once it exists. */
        parties: [
          {
            role: 'subject',
            student_id: values.subject_student_id,
            statement: present(values.statement) ?? null,
          },
        ],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentServicesKeys.all })
      toast.success('Incident filed')
      onClose()
    },
    onError: (error) => mapErrors<IncidentValues>(error, setError, 'The incident could not be filed.'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="File an incident"
      description={
        student
          ? `About ${student.name}. Witnesses and further parties are added once it is filed.`
          : 'Choose the learner it concerns first.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!student}
            onClick={handleSubmit((v) => save.mutate(v))}
          >
            File incident
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-1" noValidate>
        <Field label="What happened" required error={formState.errors.summary?.message}>
          {(props) => <Input {...props} placeholder="One line, as it would be read out" autoFocus {...register('summary')} />}
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="When" required error={formState.errors.occurred_at?.message}>
            {(props) => <Input {...props} type="datetime-local" {...register('occurred_at')} />}
          </Field>
          <Field label="Category" error={formState.errors.category?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('category')}
                options={INCIDENT_CATEGORIES.map((c) => ({
                  value: c,
                  label: c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()),
                }))}
              />
            )}
          </Field>
          <Field label="Severity" error={formState.errors.severity?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('severity')}
                options={INCIDENT_SEVERITIES.map((s) => ({
                  value: s,
                  label: s.charAt(0).toUpperCase() + s.slice(1),
                }))}
              />
            )}
          </Field>
        </div>

        <Field label="Where" error={formState.errors.location?.message}>
          {(props) => <Input {...props} placeholder="Science block corridor" {...register('location')} />}
        </Field>

        <Field label="Account" hint="What was seen, in the words of whoever saw it." error={formState.errors.description?.message}>
          {(props) => <Textarea {...props} rows={3} {...register('description')} />}
        </Field>

        <label className="flex items-start gap-2.5 py-1.5">
          <Switch
            checked={watch('is_confidential')}
            onChange={(next) => setValue('is_confidential', next, { shouldDirty: true })}
            label="Confidential"
          />
          <span className="text-sm text-gray-800">
            Confidential
            <span className="block text-xs text-gray-600">
              Restricts which staff may read it. Separate from whether the family is told.
            </span>
          </span>
        </label>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}

/* ── A merit or a demerit ────────────────────────────────────────────────── */

const behaviourSchema = z.object({
  kind: z.enum(['merit', 'demerit']),
  points: z.string().refine((v) => v === '' || Number(v) >= 1, 'At least one point'),
  category: z.string().trim().max(60),
  reason: z.string().trim().min(1, 'Say why').max(250),
  occurred_on: z.string(),
})

type BehaviourValues = z.infer<typeof behaviourSchema>

export function BehaviourDialog({
  open,
  onClose,
  student,
}: {
  open: boolean
  onClose: () => void
  student: { id: string; name: string } | null
}) {
  const queryClient = useQueryClient()
  const form = useForm<BehaviourValues>({
    resolver: zodResolver(behaviourSchema),
    defaultValues: { kind: 'merit', points: '1', category: '', reason: '', occurred_on: '' },
  })
  const { formState, handleSubmit, register, reset, setError } = form

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const save = useMutation({
    mutationFn: (values: BehaviourValues) =>
      disciplineApi.addBehaviourRecord(student!.id, {
        kind: values.kind,
        points: values.points === '' ? undefined : Number(values.points),
        category: present(values.category) ?? null,
        reason: values.reason.trim(),
        occurred_on: present(values.occurred_on) ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentServicesKeys.all })
      toast.success('Recorded')
      onClose()
    },
    onError: (error) => mapErrors<BehaviourValues>(error, setError, 'That could not be recorded.'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record behaviour"
      description={student ? `About ${student.name}.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!student}
            onClick={handleSubmit((v) => save.mutate(v))}
          >
            Record
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-1" noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Kind" error={formState.errors.kind?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('kind')}
                options={[
                  { value: 'merit', label: 'Merit' },
                  { value: 'demerit', label: 'Demerit' },
                ]}
              />
            )}
          </Field>
          <Field
            label="Points"
            hint="A demerit subtracts; the API signs it."
            error={formState.errors.points?.message}
          >
            {(props) => <Input {...props} type="number" min="1" max="1000" {...register('points')} />}
          </Field>
        </div>
        <Field label="Reason" required error={formState.errors.reason?.message}>
          {(props) => <Input {...props} placeholder="Helped a new pupil settle in" autoFocus {...register('reason')} />}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Category" error={formState.errors.category?.message}>
            {(props) => <Input {...props} placeholder="Kindness" {...register('category')} />}
          </Field>
          <Field label="When" error={formState.errors.occurred_on?.message}>
            {(props) => <Input {...props} type="date" {...register('occurred_on')} />}
          </Field>
        </div>
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}
