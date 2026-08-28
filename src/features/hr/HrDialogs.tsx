import { useEffect } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { Button, Field, Input, Modal, Select, Switch, Textarea } from '@/shared/ui'
import { hrKeys, leaveApi, payrollApi, staffApi } from './hr.api'
import {
  PAYROLL_FREQUENCIES,
  QUALIFICATION_KINDS,
  toDaysX100,
  type LeaveRequest,
} from './hr.types'

/** Blank means "not given" — sent as an empty string, a date fails the API's
 *  `date` rule and a uuid fails `uuid`, so blanks are dropped here. */
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

/* ── Qualification ───────────────────────────────────────────────────────── */

const qualificationSchema = z
  .object({
    kind: z.enum(QUALIFICATION_KINDS),
    title: z.string().trim().min(1, 'Name the qualification').max(240),
    awarding_body: z.string().trim().max(240),
    field_of_study: z.string().trim().max(240),
    reference: z.string().trim().max(120),
    awarded_on: z.string(),
    expires_on: z.string(),
  })
  .refine(
    (v) => v.expires_on === '' || v.awarded_on === '' || v.expires_on >= v.awarded_on,
    { path: ['expires_on'], message: 'Expiry cannot be before the award date' },
  )

type QualificationValues = z.infer<typeof qualificationSchema>

export function QualificationDialog({
  open,
  onClose,
  staffId,
}: {
  open: boolean
  onClose: () => void
  staffId: string
}) {
  const queryClient = useQueryClient()
  const form = useForm<QualificationValues>({
    resolver: zodResolver(qualificationSchema),
    defaultValues: {
      kind: 'degree',
      title: '',
      awarding_body: '',
      field_of_study: '',
      reference: '',
      awarded_on: '',
      expires_on: '',
    },
  })
  const { formState, handleSubmit, register, reset, setError } = form

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const save = useMutation({
    mutationFn: (values: QualificationValues) =>
      staffApi.addQualification({
        staff_id: staffId,
        kind: values.kind,
        title: values.title.trim(),
        awarding_body: present(values.awarding_body),
        field_of_study: present(values.field_of_study),
        reference: present(values.reference),
        awarded_on: present(values.awarded_on),
        expires_on: present(values.expires_on),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.qualifications(staffId) })
      toast.success('Qualification added')
      onClose()
    },
    onError: (error) =>
      mapErrors<QualificationValues>(error, setError, 'The qualification could not be saved.'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a qualification"
      description="Recorded against this person. Verifying it is a separate act."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>
            Add qualification
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-1" noValidate>
        <Field label="Title" required error={formState.errors.title?.message}>
          {(props) => <Input {...props} placeholder="BSc Biology" autoFocus {...register('title')} />}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Kind" error={formState.errors.kind?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('kind')}
                options={QUALIFICATION_KINDS.map((k) => ({
                  value: k,
                  label: k.charAt(0).toUpperCase() + k.slice(1),
                }))}
              />
            )}
          </Field>
          <Field label="Field of study" error={formState.errors.field_of_study?.message}>
            {(props) => <Input {...props} {...register('field_of_study')} />}
          </Field>
        </div>
        <Field label="Awarding body" error={formState.errors.awarding_body?.message}>
          {(props) => <Input {...props} placeholder="University of Ibadan" {...register('awarding_body')} />}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Awarded on" error={formState.errors.awarded_on?.message}>
            {(props) => <Input {...props} type="date" {...register('awarded_on')} />}
          </Field>
          <Field
            label="Expires on"
            hint="Leave blank if it does not expire."
            error={formState.errors.expires_on?.message}
          >
            {(props) => <Input {...props} type="date" {...register('expires_on')} />}
          </Field>
          <Field label="Reference" error={formState.errors.reference?.message}>
            {(props) => <Input {...props} {...register('reference')} />}
          </Field>
        </div>
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}

/* ── Leave type ──────────────────────────────────────────────────────────── */

const leaveTypeSchema = z.object({
  name: z.string().trim().min(1, 'Name the leave type').max(160),
  code: z.string().trim().min(1, 'Give it a code').max(60),
  default_entitlement_days: z.string(),
  min_notice_days: z.string(),
  description: z.string().trim().max(2000),
  is_paid: z.boolean(),
  requires_approval: z.boolean(),
  counts_weekends: z.boolean(),
  allows_negative_balance: z.boolean(),
})

type LeaveTypeValues = z.infer<typeof leaveTypeSchema>

export function LeaveTypeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<LeaveTypeValues>({
    resolver: zodResolver(leaveTypeSchema),
    defaultValues: {
      name: '',
      code: '',
      default_entitlement_days: '20',
      min_notice_days: '0',
      description: '',
      is_paid: true,
      requires_approval: true,
      counts_weekends: false,
      allows_negative_balance: false,
    },
  })
  const { formState, handleSubmit, register, reset, setError, setValue, watch } = form

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const save = useMutation({
    mutationFn: (values: LeaveTypeValues) =>
      leaveApi.createType({
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        /* Days are stored in hundredths so half a day is exact — see
         * `formatDays`. The form collects whole days and scales here. */
        default_entitlement_days_x100: toDaysX100(values.default_entitlement_days) ?? 0,
        min_notice_days: Number(values.min_notice_days) || 0,
        description: present(values.description) ?? null,
        is_paid: values.is_paid,
        requires_approval: values.requires_approval,
        counts_weekends: values.counts_weekends,
        allows_negative_balance: values.allows_negative_balance,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.all })
      toast.success('Leave type created')
      onClose()
    },
    onError: (error) => mapErrors<LeaveTypeValues>(error, setError, 'The leave type could not be saved.'),
  })

  const toggle = (name: keyof LeaveTypeValues, label: string, hint: string) => (
    <label key={name} className="flex items-start gap-2.5 py-1.5">
      <Switch
        checked={Boolean(watch(name))}
        onChange={(next) => setValue(name, next, { shouldDirty: true })}
        label={label}
      />
      <span className="text-sm text-gray-800">
        {label}
        <span className="block text-xs text-gray-600">{hint}</span>
      </span>
    </label>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New leave type"
      description="How a kind of leave behaves — whether it is paid, needs approval, and how much is granted by default."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>
            Create type
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-1" noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Name" required error={formState.errors.name?.message}>
            {(props) => <Input {...props} placeholder="Annual leave" autoFocus {...register('name')} />}
          </Field>
          <Field label="Code" required error={formState.errors.code?.message}>
            {(props) => <Input {...props} placeholder="ANNUAL" className="uppercase" {...register('code')} />}
          </Field>
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            label="Default entitlement"
            hint="Days granted per period unless overridden."
            error={formState.errors.default_entitlement_days?.message}
          >
            {(props) => (
              <Input {...props} type="number" step="0.5" min="0" {...register('default_entitlement_days')} />
            )}
          </Field>
          <Field
            label="Minimum notice"
            hint="Days of notice required before it starts."
            error={formState.errors.min_notice_days?.message}
          >
            {(props) => <Input {...props} type="number" min="0" max="365" {...register('min_notice_days')} />}
          </Field>
        </div>
        <div className="pt-1">
          {toggle('is_paid', 'Paid', 'Unpaid leave is deducted on the payslip.')}
          {toggle('requires_approval', 'Requires approval', 'Otherwise it is granted on submission.')}
          {toggle('counts_weekends', 'Counts weekends', 'Whether Saturday and Sunday consume entitlement.')}
          {toggle('allows_negative_balance', 'Allows a negative balance', 'Lets somebody borrow against next period.')}
        </div>
        <Field label="Description" error={formState.errors.description?.message}>
          {(props) => <Textarea {...props} rows={2} {...register('description')} />}
        </Field>
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}

/* ── Decide a leave request ──────────────────────────────────────────────── */

export function DecideLeaveDialog({
  request,
  onClose,
}: {
  request: LeaveRequest | undefined
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const form = useForm<{ notes: string }>({ defaultValues: { notes: '' } })
  const { handleSubmit, register, reset } = form

  useEffect(() => {
    if (request) reset({ notes: '' })
  }, [request, reset])

  const decide = useMutation({
    mutationFn: ({ approve, notes }: { approve: boolean; notes: string }) =>
      leaveApi.decide(request!.id, { approve, notes: present(notes) ?? null }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hrKeys.all })
      toast.success(variables.approve ? 'Leave approved' : 'Leave rejected')
      onClose()
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.rootMessage() : 'The decision could not be saved.'),
  })

  return (
    <Modal
      open={request !== undefined}
      onClose={onClose}
      title="Decide this request"
      description={
        request
          ? `${request.reference ?? 'Request'} · ${request.start_on} to ${request.end_on}`
          : undefined
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={decide.isPending && decide.variables?.approve === false}
            onClick={handleSubmit((v) => decide.mutate({ approve: false, notes: v.notes }))}
          >
            Reject
          </Button>
          <Button
            variant="primary"
            loading={decide.isPending && decide.variables?.approve === true}
            onClick={handleSubmit((v) => decide.mutate({ approve: true, notes: v.notes }))}
          >
            Approve
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-1" noValidate>
        {request?.reason && (
          <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs font-medium text-gray-600">Reason given</p>
            <p className="mt-0.5 text-sm text-gray-900">{request.reason}</p>
          </div>
        )}
        <Field label="Notes" hint="Recorded against the decision, whichever way it goes.">
          {(props) => <Textarea {...props} rows={3} {...register('notes')} />}
        </Field>
      </form>
    </Modal>
  )
}

/* ── Payroll period ──────────────────────────────────────────────────────── */

const periodSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the period').max(160),
    code: z.string().trim().min(1, 'Give it a code').max(60),
    frequency: z.enum(PAYROLL_FREQUENCIES),
    starts_on: z.string().min(1, 'Pick a start date'),
    ends_on: z.string().min(1, 'Pick an end date'),
    pay_date: z.string().min(1, 'Pick a pay date'),
  })
  .refine((v) => v.ends_on >= v.starts_on, { path: ['ends_on'], message: 'The end cannot precede the start' })
  .refine((v) => v.pay_date >= v.starts_on, { path: ['pay_date'], message: 'Pay day cannot precede the start' })

type PeriodValues = z.infer<typeof periodSchema>

export function PayrollPeriodDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<PeriodValues>({
    resolver: zodResolver(periodSchema),
    defaultValues: {
      name: '',
      code: '',
      frequency: 'monthly',
      starts_on: '',
      ends_on: '',
      pay_date: '',
    },
  })
  const { formState, handleSubmit, register, reset, setError } = form

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const save = useMutation({
    mutationFn: (values: PeriodValues) =>
      payrollApi.createPeriod({
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        frequency: values.frequency,
        starts_on: values.starts_on,
        ends_on: values.ends_on,
        pay_date: values.pay_date,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.all })
      toast.success('Period created')
      onClose()
    },
    onError: (error) => mapErrors<PeriodValues>(error, setError, 'The period could not be saved.'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New payroll period"
      description="The window a run covers, and the day people are paid."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>
            Create period
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-1" noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Name" required error={formState.errors.name?.message}>
            {(props) => <Input {...props} placeholder="September 2026" autoFocus {...register('name')} />}
          </Field>
          <Field label="Code" required error={formState.errors.code?.message}>
            {(props) => <Input {...props} placeholder="2026-09" className="uppercase" {...register('code')} />}
          </Field>
        </div>
        <Field label="Frequency" error={formState.errors.frequency?.message}>
          {(props) => (
            <Select
              {...props}
              {...register('frequency')}
              options={PAYROLL_FREQUENCIES.map((f) => ({
                value: f,
                label: f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
              }))}
            />
          )}
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Starts" required error={formState.errors.starts_on?.message}>
            {(props) => <Input {...props} type="date" {...register('starts_on')} />}
          </Field>
          <Field label="Ends" required error={formState.errors.ends_on?.message}>
            {(props) => <Input {...props} type="date" {...register('ends_on')} />}
          </Field>
          <Field label="Pay date" required error={formState.errors.pay_date?.message}>
            {(props) => <Input {...props} type="date" {...register('pay_date')} />}
          </Field>
        </div>
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}
