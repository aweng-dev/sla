import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ArrowsLeftRight,
  CaretDown,
  GraduationCap,
  PencilSimple,
  SignOut,
  TrendUp,
} from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { qk } from '@/shared/api/queryKeys'
import { usePermissions, useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { Field, Input, Menu, Select, Textarea, type MenuItemSpec } from '@/shared/ui'
import { FieldRow, FormDialog } from '@/features/academics/components/FormDialog'
import { useServerErrors } from '@/features/academics/components/useServerErrors'
import {
  useLevelCatalog,
  useProgramCatalog,
  useSessionCatalog,
} from '@/features/academics/components/pickers'
import { studentsApi, type UpdateStudentPayload } from './students.api'
import type { StudentRecord } from './students.types'

/**
 * Everything that can be done TO a student record, in one control.
 *
 * ── Why a menu of transitions rather than an editable status ───────────────
 *
 * Promote, transfer, withdraw and graduate are four POSTs to named sub-routes,
 * and each does domain work a column write could not: graduating ends every
 * open session, programme and period enrolment, drops the course
 * registrations and closes the learning-group membership. `PUT /admin/students/{id}`
 * does not accept `status` at all — it takes the person's details and their
 * numbers — so these outcomes are unreachable by editing, and unreachable in
 * reverse: there is no un-graduate endpoint.
 *
 * ── Every one of them confirms, and says what it will do ───────────────────
 *
 * Not because a confirm step is good manners, but because these are one-way.
 * The dialogs name the consequence — "ends every open enrolment" — rather than
 * asking "are you sure?", which tells the reader nothing they did not already
 * know when they clicked.
 */
export function StudentActions({ student }: { student: StudentRecord }) {
  const perms = usePermissions()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [action, setAction] = useState<'edit' | 'promote' | 'transfer' | 'withdraw' | 'graduate' | null>(
    null,
  )

  const canManage = perms.has('students.manage')
  /* `promote` is the policy the API checks for all four lifecycle routes —
   * transfer, withdraw and graduate authorize against it too. */
  const canMoveOn = canManage && perms.hasAny('students.manage', 'enrollment.manage')

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: qk.students.all })
    queryClient.invalidateQueries({ queryKey: ['academics'] })
    toast.success(message)
  }

  const isOnRoll = student.status === 'active'

  const items: MenuItemSpec[] = []
  if (canManage) {
    items.push({
      key: 'edit',
      label: 'Edit details',
      icon: <PencilSimple size={15} />,
      onSelect: () => setAction('edit'),
    })
  }
  if (canMoveOn && isOnRoll) {
    items.push(
      {
        key: 'promote',
        label: `Promote or hold back`,
        icon: <TrendUp size={15} />,
        separated: true,
        onSelect: () => setAction('promote'),
      },
      {
        key: 'transfer',
        label: 'Transfer',
        icon: <ArrowsLeftRight size={15} />,
        onSelect: () => setAction('transfer'),
      },
      {
        key: 'withdraw',
        label: 'Withdraw',
        icon: <SignOut size={15} />,
        destructive: true,
        separated: true,
        onSelect: () => setAction('withdraw'),
      },
      {
        key: 'graduate',
        label: 'Graduate',
        icon: <GraduationCap size={15} />,
        destructive: true,
        onSelect: () => setAction('graduate'),
      },
    )
  }

  if (items.length === 0) return null

  return (
    <>
      <Menu
        items={items}
        trigger={({ toggle, ref, open }) => (
          <button
            ref={ref as never}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-sm text-gray-900 transition-colors hover:bg-gray-50',
              open ? 'border-gray-400' : 'border-gray-300',
            )}
          >
            Actions
            <CaretDown size={11} weight="bold" className="text-gray-600" />
          </button>
        )}
      />

      {action === 'edit' && (
        <EditDialog student={student} onClose={() => setAction(null)} onSaved={() => settle('Saved')} />
      )}
      {action === 'promote' && (
        <PromoteDialog
          student={student}
          onClose={() => setAction(null)}
          onDone={(message) => settle(message)}
        />
      )}
      {action === 'transfer' && (
        <TransferDialog
          student={student}
          onClose={() => setAction(null)}
          onDone={() => settle(`${student.person.full_name} transferred`)}
        />
      )}
      {action === 'withdraw' && (
        <WithdrawDialog
          student={student}
          onClose={() => setAction(null)}
          onDone={() => {
            settle(`${student.person.full_name} withdrawn`)
            navigate({ to: '/students' })
          }}
        />
      )}
      {action === 'graduate' && (
        <GraduateDialog
          student={student}
          onClose={() => setAction(null)}
          onDone={() => settle(`${student.person.full_name} graduated`)}
        />
      )}
    </>
  )
}

/* ── Edit ───────────────────────────────────────────────────────────────── */

const editSchema = z.object({
  first_name: z.string().trim().min(1, 'Enter a first name'),
  middle_name: z.string().optional(),
  last_name: z.string().trim().min(1, 'Enter a last name'),
  preferred_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),
  student_number: z.string().optional(),
  admission_number: z.string().optional(),
  admission_date: z.string().optional(),
})
type EditValues = z.infer<typeof editSchema>

function EditDialog({
  student,
  onClose,
  onSaved,
}: {
  student: StudentRecord
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTerminology()
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      first_name: student.person.first_name,
      middle_name: student.person.middle_name ?? '',
      last_name: student.person.last_name,
      preferred_name: student.person.preferred_name ?? '',
      date_of_birth: student.person.date_of_birth ?? '',
      gender: student.person.gender ?? '',
      student_number: student.student_number ?? '',
      admission_number: student.admission_number ?? '',
      admission_date: student.admission_date ?? '',
    },
  })
  const applyServerErrors = useServerErrors(form)

  const save = useMutation({
    mutationFn: (values: EditValues) => {
      /*
       * Every rule on this endpoint is `sometimes`, which means ABSENT is how
       * you say "leave it alone" — and `student_number` is `sometimes|required`,
       * so sending it as null to mean "blank" is a 422 rather than a clear.
       * Empty fields are therefore omitted rather than nulled.
       */
      const payload: UpdateStudentPayload = {
        person: {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          middle_name: values.middle_name?.trim() || null,
          preferred_name: values.preferred_name?.trim() || null,
          date_of_birth: values.date_of_birth || null,
          gender: values.gender || null,
        },
      }
      const number = values.student_number?.trim()
      if (number) payload.student_number = number
      const admission = values.admission_number?.trim()
      if (admission) payload.admission_number = admission
      if (values.admission_date) payload.admission_date = values.admission_date

      return studentsApi.update(student.student_id, payload)
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: applyServerErrors,
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Edit ${student.person.full_name}`}
      description="Their name, dates and numbers. Placement is changed by promoting or transferring."
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      submitLabel="Save changes"
      size="lg"
    >
      <FieldRow>
        <Field label="First name" required error={form.formState.errors.first_name?.message}>
          {(props) => <Input {...props} {...form.register('first_name')} />}
        </Field>
        <Field label="Last name" required error={form.formState.errors.last_name?.message}>
          {(props) => <Input {...props} {...form.register('last_name')} />}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Middle name" error={form.formState.errors.middle_name?.message}>
          {(props) => <Input {...props} {...form.register('middle_name')} />}
        </Field>
        <Field label="Known as" error={form.formState.errors.preferred_name?.message}>
          {(props) => <Input {...props} {...form.register('preferred_name')} />}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Date of birth" error={form.formState.errors.date_of_birth?.message}>
          {(props) => <Input {...props} type="date" {...form.register('date_of_birth')} />}
        </Field>
        <Field label="Gender" error={form.formState.errors.gender?.message}>
          {(props) => (
            <Select
              {...props}
              options={[
                { value: '', label: 'Not stated' },
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                { value: 'other', label: 'Other' },
              ]}
              {...form.register('gender')}
            />
          )}
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={`${t('learner')} number`} error={form.formState.errors.student_number?.message}>
          {(props) => <Input {...props} {...form.register('student_number')} />}
        </Field>
        <Field label="Admission number" error={form.formState.errors.admission_number?.message}>
          {(props) => <Input {...props} {...form.register('admission_number')} />}
        </Field>
      </FieldRow>
      <Field label="Admitted on" error={form.formState.errors.admission_date?.message}>
        {(props) => <Input {...props} type="date" {...form.register('admission_date')} />}
      </Field>
    </FormDialog>
  )
}

/* ── Promote ────────────────────────────────────────────────────────────── */

const promoteSchema = z.object({
  academic_session_id: z.string().min(1, 'Choose the session to promote into'),
  academic_level_id: z.string().optional(),
  repeat: z.boolean().optional(),
})
type PromoteValues = z.infer<typeof promoteSchema>

function PromoteDialog({
  student,
  onClose,
  onDone,
}: {
  student: StudentRecord
  onClose: () => void
  onDone: (message: string) => void
}) {
  const t = useTerminology()
  const { access } = useTenant()
  const sessions = useSessionCatalog()
  const levels = useLevelCatalog()

  const form = useForm<PromoteValues>({
    resolver: zodResolver(promoteSchema),
    defaultValues: {
      academic_session_id: access?.calendar?.session?.id ?? '',
      academic_level_id: '',
      repeat: false,
    },
  })
  const applyServerErrors = useServerErrors(form)

  const run = useMutation({
    mutationFn: (values: PromoteValues) =>
      studentsApi.promote(student.student_id, {
        academic_session_id: values.academic_session_id,
        academic_level_id: values.academic_level_id || null,
        repeat: values.repeat ?? false,
      }),
    onSuccess: (result) => {
      /* The API answers a summary, and its `promotion_status` is the honest
       * word for what happened — promoted, retained, graduated. Reporting
       * "promoted" for a held-back learner would be a lie the screen told. */
      onDone(`${student.person.full_name}: ${result.promotion_status}`)
      onClose()
    },
    onError: applyServerErrors,
  })

  const repeating = form.watch('repeat')

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Promote ${student.person.full_name}`}
      description={`Currently ${student.level?.name ?? `no ${t('level').toLowerCase()}`}.`}
      form={form}
      onSubmit={(values) => run.mutate(values)}
      pending={run.isPending}
      submitLabel={repeating ? 'Hold back' : 'Promote'}
    >
      {/* The server refuses promotion until the session's results are
        * published — a 409, not a validation error. Saying so here means the
        * reader is not sent to fill in a form that cannot be submitted yet. */}
      <p className="mb-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
        A {t('session').toLowerCase()}&rsquo;s results must be published before promotion can be
        decided. If they are not, this will be refused and say so.
      </p>

      <Field
        label={`Into which ${t('session').toLowerCase()}`}
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

      <Field
        label={`Into which ${t('level').toLowerCase()}`}
        hint="Leave blank to let the ladder decide the next one"
        error={form.formState.errors.academic_level_id?.message}
      >
        {(props) => (
          <Select
            {...props}
            options={[{ value: '', label: 'Next one up' }, ...levels.options]}
            disabled={repeating}
            {...form.register('academic_level_id')}
          />
        )}
      </Field>

      <label className="flex items-start gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 cursor-pointer rounded-sm border border-gray-400 accent-brand-400"
          {...form.register('repeat')}
        />
        <span>
          Hold back instead
          <span className="block text-xs text-gray-600">
            They stay at this {t('level').toLowerCase()} for the new{' '}
            {t('session').toLowerCase()}. The decision is recorded either way.
          </span>
        </span>
      </label>
    </FormDialog>
  )
}

/* ── Transfer ───────────────────────────────────────────────────────────── */

const transferSchema = z
  .object({
    reason: z.string().trim().min(1, 'Say why they are transferring'),
    to_program_id: z.string().optional(),
    to_campus_id: z.string().optional(),
    academic_level_id: z.string().optional(),
  })
  /* The API validates these as `required_without` each other; checking it here
   * too means the reader is told before the round trip. */
  .refine((v) => Boolean(v.to_program_id || v.to_campus_id), {
    path: ['to_program_id'],
    message: 'Choose where they are transferring to',
  })
type TransferValues = z.infer<typeof transferSchema>

function TransferDialog({
  student,
  onClose,
  onDone,
}: {
  student: StudentRecord
  onClose: () => void
  onDone: () => void
}) {
  const t = useTerminology()
  const { access } = useTenant()
  const programs = useProgramCatalog()
  const levels = useLevelCatalog()
  const supportsCampuses = access?.institution.supports_campuses ?? false

  const form = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { reason: '', to_program_id: '', to_campus_id: '', academic_level_id: '' },
  })
  const applyServerErrors = useServerErrors(form)

  const run = useMutation({
    mutationFn: (values: TransferValues) =>
      studentsApi.transfer(student.student_id, {
        reason: values.reason.trim(),
        to_program_id: values.to_program_id || null,
        to_campus_id: values.to_campus_id || null,
        academic_level_id: values.academic_level_id || null,
      }),
    onSuccess: () => {
      onDone()
      onClose()
    },
    onError: applyServerErrors,
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Transfer ${student.person.full_name}`}
      description={`Currently on ${student.program?.name ?? `no ${t('programme').toLowerCase()}`}.`}
      form={form}
      onSubmit={(values) => run.mutate(values)}
      pending={run.isPending}
      submitLabel="Transfer"
    >
      <Field
        label={`To which ${t('programme').toLowerCase()}`}
        error={form.formState.errors.to_program_id?.message}
      >
        {(props) => (
          <Select
            {...props}
            options={[{ value: '', label: 'No change' }, ...programs.options]}
            {...form.register('to_program_id')}
          />
        )}
      </Field>

      <Field
        label={`Into which ${t('level').toLowerCase()}`}
        hint="Optional — leave blank to keep their current one"
        error={form.formState.errors.academic_level_id?.message}
      >
        {(props) => (
          <Select
            {...props}
            options={[{ value: '', label: 'No change' }, ...levels.options]}
            {...form.register('academic_level_id')}
          />
        )}
      </Field>

      {!supportsCampuses && (
        <p className="-mt-1 text-xs text-gray-600">
          This institution is not arranged into {t('campuses').toLowerCase()}, so a transfer here
          means a change of {t('programme').toLowerCase()}.
        </p>
      )}

      <Field label="Reason" required error={form.formState.errors.reason?.message}>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            placeholder="Kept on the record — somebody will need to explain this later."
            {...form.register('reason')}
          />
        )}
      </Field>
    </FormDialog>
  )
}

/* ── Withdraw ───────────────────────────────────────────────────────────── */

const withdrawSchema = z.object({
  reason: z.string().trim().min(1, 'Say why they are leaving'),
  withdrawn_on: z.string().optional(),
})
type WithdrawValues = z.infer<typeof withdrawSchema>

function WithdrawDialog({
  student,
  onClose,
  onDone,
}: {
  student: StudentRecord
  onClose: () => void
  onDone: () => void
}) {
  const t = useTerminology()
  const form = useForm<WithdrawValues>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { reason: '', withdrawn_on: '' },
  })
  const applyServerErrors = useServerErrors(form)

  const run = useMutation({
    mutationFn: (values: WithdrawValues) =>
      studentsApi.withdraw(student.student_id, {
        reason: values.reason.trim(),
        withdrawn_on: values.withdrawn_on || null,
      }),
    onSuccess: () => {
      onDone()
      onClose()
    },
    onError: applyServerErrors,
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Withdraw ${student.person.full_name}`}
      description="This ends their open enrolments and takes them off the roll. There is no undo."
      form={form}
      onSubmit={(values) => run.mutate(values)}
      pending={run.isPending}
      submitLabel="Withdraw"
      destructive
    >
      <Field label="Reason" required error={form.formState.errors.reason?.message}>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            placeholder="Moved away, transferred to another school, left mid-year…"
            {...form.register('reason')}
          />
        )}
      </Field>
      <Field
        label="Last day"
        hint="Leave blank for today"
        error={form.formState.errors.withdrawn_on?.message}
      >
        {(props) => <Input {...props} type="date" {...form.register('withdrawn_on')} />}
      </Field>
      <p className="text-xs text-gray-600">
        Their {t('period').toLowerCase()} record up to this date is kept — the register has to keep
        saying they were here.
      </p>
    </FormDialog>
  )
}

/* ── Graduate ───────────────────────────────────────────────────────────── */

const graduateSchema = z.object({ graduated_on: z.string().optional() })
type GraduateValues = z.infer<typeof graduateSchema>

function GraduateDialog({
  student,
  onClose,
  onDone,
}: {
  student: StudentRecord
  onClose: () => void
  onDone: () => void
}) {
  const t = useTerminology()
  const form = useForm<GraduateValues>({
    resolver: zodResolver(graduateSchema),
    defaultValues: { graduated_on: '' },
  })
  const applyServerErrors = useServerErrors(form)

  const run = useMutation({
    mutationFn: (values: GraduateValues) =>
      studentsApi.graduate(student.student_id, { graduated_on: values.graduated_on || null }),
    onSuccess: () => {
      onDone()
      onClose()
    },
    onError: applyServerErrors,
  })

  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Graduate ${student.person.full_name}`}
      form={form}
      onSubmit={(values) => run.mutate(values)}
      pending={run.isPending}
      submitLabel="Graduate"
      destructive
    >
      {/* Named consequences, not "are you sure?". This is the one action on
        * the record with no inverse anywhere in the API. */}
      <div className="mb-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
        <p className="text-sm font-medium text-gray-900">This will:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-gray-800">
          <li>end every open {t('session').toLowerCase()} and {t('programme').toLowerCase()} enrolment</li>
          <li>drop their {t('course').toLowerCase()} registrations</li>
          <li>close their {t('group').toLowerCase()} membership</li>
          <li>take them off the roll and mark them an alumnus</li>
        </ul>
        <p className="mt-2 text-sm text-danger-700">
          There is no way to reverse this from the app.
        </p>
      </div>

      <Field
        label="Graduated on"
        hint="Leave blank for today"
        error={form.formState.errors.graduated_on?.message}
      >
        {(props) => <Input {...props} type="date" {...form.register('graduated_on')} />}
      </Field>
    </FormDialog>
  )
}
