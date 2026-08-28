import { useEffect } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { Button, Field, Input, Modal, Select } from '@/shared/ui'
import { GUARDIAN_STATUSES, guardiansApi } from './guardians.api'
import type { GuardianPayload, GuardianRecord } from './guardians.types'

/**
 * One dialog for adding a guardian and for editing one.
 *
 * ── Why not two ────────────────────────────────────────────────────────────
 *
 * `POST /admin/guardians` and `PUT /admin/guardians/{id}` take the SAME body:
 * a nested `person` plus occupation, employer and status. The only difference
 * is that create requires the two names and update requires nothing. Two forms
 * would be the same twelve fields written twice, and the second copy is the
 * one that drifts.
 *
 * ── Every field here is one the API actually accepts ───────────────────────
 *
 * Read from `StoreGuardianRequest` / `UpdateGuardianRequest`, and confirmed by
 * submitting a deliberately bad body and reading the 422 back. Nothing is
 * offered that the endpoint would ignore.
 */

const today = () => new Date().toISOString().slice(0, 10)

const schema = z.object({
  person: z.object({
    first_name: z.string().trim().min(1, 'Enter a first name').max(120),
    last_name: z.string().trim().min(1, 'Enter a last name').max(120),
    middle_name: z.string().trim().max(120),
    preferred_name: z.string().trim().max(120),
    date_of_birth: z
      .string()
      .refine((value) => value === '' || value < today(), 'A date of birth must be in the past'),
    gender: z.string(),
    /* The API asks for exactly two characters — an ISO 3166-1 alpha-2 code. */
    nationality_code: z
      .string()
      .trim()
      .refine((value) => value === '' || value.length === 2, 'Use a two-letter code, like NG'),
    email: z
      .string()
      .trim()
      .refine((value) => value === '' || z.email().safeParse(value).success, 'Enter a valid email address'),
    phone: z.string().trim().max(50),
  }),
  occupation: z.string().trim().max(160),
  employer: z.string().trim().max(255),
  status: z.string(),
})

type Values = z.infer<typeof schema>

const BLANK: Values = {
  person: {
    first_name: '',
    last_name: '',
    middle_name: '',
    preferred_name: '',
    date_of_birth: '',
    gender: '',
    nationality_code: '',
    email: '',
    phone: '',
  },
  occupation: '',
  employer: '',
  status: 'active',
}

/** Blank means "not given". Sent as an empty string, `date_of_birth` fails the
 *  API's `date` rule and `nationality_code` fails `size:2`, so the blanks are
 *  dropped here rather than argued about there.
 *
 *  On UPDATE a blank is meaningful in a way it is not on create: it is how a
 *  reader clears a value they had typed before. Those fields are nullable on
 *  the API, so an edit sends `null` where a create sends nothing. */
function present(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function fromRecord(record: GuardianRecord): Values {
  return {
    person: {
      first_name: record.person.first_name ?? '',
      last_name: record.person.last_name ?? '',
      middle_name: record.person.middle_name ?? '',
      preferred_name: record.person.preferred_name ?? '',
      date_of_birth: record.person.date_of_birth ?? '',
      gender: record.person.gender ?? '',
      nationality_code: record.person.nationality_code ?? '',
      email: record.person.email ?? '',
      phone: record.person.phone ?? '',
    },
    occupation: record.occupation ?? '',
    employer: record.employer ?? '',
    status: record.status ?? 'active',
  }
}

export function GuardianDialog({
  open,
  onClose,
  /** Absent for a new guardian; present to edit one. */
  guardian,
}: {
  open: boolean
  onClose: () => void
  guardian?: GuardianRecord
}) {
  const t = useTerminology()
  const queryClient = useQueryClient()
  const editing = guardian !== undefined

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const { formState, handleSubmit, register, reset, setError } = form

  /* Re-seed whenever the dialog opens, so editing a second guardian without a
   * remount does not show the first one's details. */
  useEffect(() => {
    if (!open) return
    reset(guardian ? fromRecord(guardian) : BLANK)
  }, [open, guardian, reset])

  const save = useMutation({
    mutationFn: (payload: GuardianPayload) =>
      editing ? guardiansApi.update(guardian.id, payload) : guardiansApi.create(payload),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: qk.guardians.all })
      toast.success(
        editing ? `${record.person.full_name} updated` : `${record.person.full_name} added`,
      )
      onClose()
    },
    onError: (error: unknown) => {
      if (!(error instanceof ApiError)) {
        toast.error(`The ${t('guardian').toLowerCase()} could not be saved.`)
        return
      }

      const fields = error.fieldErrors()
      /* `errors[].field` is the input's own name, dots and all —
       * `person.first_name` is exactly the path react-hook-form registered. */
      for (const [field, message] of Object.entries(fields)) {
        setError(field as FieldPath<Values>, { message })
      }
      if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
    },
  })

  function submit(values: Values) {
    /* On an edit a cleared box means "remove this"; on a create it means "not
     * given". The API takes null for the first and nothing for the second. */
    const optional = (value: string) => (editing ? (present(value) ?? null) : present(value))

    save.mutate({
      person: {
        first_name: values.person.first_name.trim(),
        last_name: values.person.last_name.trim(),
        middle_name: optional(values.person.middle_name),
        preferred_name: optional(values.person.preferred_name),
        date_of_birth: optional(values.person.date_of_birth),
        gender: optional(values.person.gender),
        nationality_code: optional(values.person.nationality_code)?.toUpperCase(),
        email: optional(values.person.email),
        phone: optional(values.person.phone),
      },
      occupation: optional(values.occupation),
      employer: optional(values.employer),
      status: values.status || undefined,
    })
  }

  const noun = t('guardian').toLowerCase()

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${noun}` : `Add a ${noun}`}
      description={
        editing
          ? 'Changes apply to this person everywhere they appear.'
          : `Creates the person and their ${noun} record. Link them to a child from the child's record.`
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={handleSubmit(submit)}
            disabled={!formState.isDirty && editing}
          >
            {editing ? 'Save changes' : `Add ${noun}`}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-1" noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="First name" required error={formState.errors.person?.first_name?.message}>
            {(props) => <Input {...props} {...register('person.first_name')} autoFocus />}
          </Field>
          <Field label="Last name" required error={formState.errors.person?.last_name?.message}>
            {(props) => <Input {...props} {...register('person.last_name')} />}
          </Field>
          <Field label="Middle name" error={formState.errors.person?.middle_name?.message}>
            {(props) => <Input {...props} {...register('person.middle_name')} />}
          </Field>
          <Field
            label="Known as"
            hint="Used in place of the first name where one is set."
            error={formState.errors.person?.preferred_name?.message}
          >
            {(props) => <Input {...props} {...register('person.preferred_name')} />}
          </Field>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Date of birth" error={formState.errors.person?.date_of_birth?.message}>
            {(props) => <Input {...props} type="date" max={today()} {...register('person.date_of_birth')} />}
          </Field>
          <Field label="Gender" error={formState.errors.person?.gender?.message}>
            {(props) => <Input {...props} {...register('person.gender')} />}
          </Field>
          <Field
            label="Nationality"
            hint="Two letters, like NG."
            error={formState.errors.person?.nationality_code?.message}
          >
            {(props) => (
              <Input {...props} maxLength={2} className="uppercase" {...register('person.nationality_code')} />
            )}
          </Field>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            label="Email address"
            hint="The school writes here. It does not create a login."
            error={formState.errors.person?.email?.message}
          >
            {(props) => <Input {...props} type="email" {...register('person.email')} />}
          </Field>
          <Field label="Phone" error={formState.errors.person?.phone?.message}>
            {(props) => <Input {...props} type="tel" {...register('person.phone')} />}
          </Field>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Occupation" error={formState.errors.occupation?.message}>
            {(props) => <Input {...props} {...register('occupation')} />}
          </Field>
          <Field label="Employer" error={formState.errors.employer?.message}>
            {(props) => <Input {...props} {...register('employer')} />}
          </Field>
          <Field label="Status" error={formState.errors.status?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('status')}
                options={GUARDIAN_STATUSES.map((status) => ({
                  value: status,
                  label: status.charAt(0).toUpperCase() + status.slice(1),
                }))}
              />
            )}
          </Field>
        </div>

        {/* Submits on Enter without a visible duplicate of the footer button. */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}
