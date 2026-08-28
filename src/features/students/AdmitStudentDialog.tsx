import { useEffect, useMemo } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { Button, Field, Input, Modal, Select } from '@/shared/ui'
import { catalogApi, catalogKeys, studentsApi, type AdmitStudentPayload } from './students.api'

/**
 * Admission, in one dialog.
 *
 * ── Why a dialog is honest here and not a stub ─────────────────────────────
 *
 * `POST /admin/students` requires exactly two things: a first name and a last
 * name. Everything else — the number, the date, the placement — is optional by
 * design, because a student admitted in February before their class is decided
 * is a real state and demanding a session would push the registrar into
 * inventing one. So this form can collect everything the endpoint accepts, and
 * a "create" that navigated to a longer wizard would be inventing a
 * requirement the API does not have.
 *
 * ── Placement is offered, not forced ───────────────────────────────────────
 *
 * Choosing a session, section, year group and class writes the enrolment rows
 * in the same transaction as the person. Leaving them blank admits the student
 * with no placement, which the record screen then shows as "Not placed" rather
 * than pretending. If the catalog cannot be read, the placement block is not
 * drawn at all — a set of empty selects would look like a system with no
 * classes in it.
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
  }),
  admission_number: z.string().trim().max(120),
  admission_date: z.string(),
  academic_session_id: z.string(),
  program_id: z.string(),
  academic_level_id: z.string(),
  learning_group_id: z.string(),
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
  },
  admission_number: '',
  admission_date: '',
  academic_session_id: '',
  program_id: '',
  academic_level_id: '',
  learning_group_id: '',
}

/** Blank means "not given". Sent as an empty string, `date_of_birth` fails the
 *  API's `date` rule and `program_id` fails `uuid`, so the blanks are dropped
 *  here rather than argued about there. */
function present(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function AdmitStudentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTerminology()
  const queryClient = useQueryClient()

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const { formState, handleSubmit, register, reset, setError, setValue, watch } = form

  const sessions = useQuery({
    queryKey: catalogKeys.sessions,
    queryFn: catalogApi.sessions,
    enabled: open,
    staleTime: 10 * 60_000,
  })
  const programs = useQuery({
    queryKey: catalogKeys.programs,
    queryFn: catalogApi.programs,
    enabled: open,
    staleTime: 10 * 60_000,
  })
  const levels = useQuery({
    queryKey: catalogKeys.levels,
    queryFn: catalogApi.levels,
    enabled: open,
    staleTime: 10 * 60_000,
  })
  const groups = useQuery({
    queryKey: catalogKeys.groups,
    queryFn: catalogApi.groups,
    enabled: open,
    staleTime: 10 * 60_000,
  })

  const canPlace = !sessions.isError && !programs.isError && !levels.isError && !groups.isError

  const currentSessionId = sessions.data?.find((session) => session.is_current)?.id ?? ''
  const chosenLevel = watch('academic_level_id')
  const chosenGroup = watch('learning_group_id')

  /* The institution is almost always admitting into the session it is in.
   * Preselected rather than defaulted server-side, so the registrar can see
   * which one they are about to write to. */
  useEffect(() => {
    if (open && currentSessionId) setValue('academic_session_id', currentSessionId)
  }, [open, currentSessionId, setValue])

  /* A class belongs to a year group. Once the year group is chosen, offering
   * the other years' classes is offering a placement the API would refuse. */
  const groupOptions = useMemo(() => {
    const all = groups.data ?? []
    return chosenLevel ? all.filter((group) => group.academic_level_id === chosenLevel) : all
  }, [groups.data, chosenLevel])

  useEffect(() => {
    if (chosenGroup && !groupOptions.some((group) => group.id === chosenGroup)) {
      setValue('learning_group_id', '')
    }
  }, [chosenGroup, groupOptions, setValue])

  const admit = useMutation({
    mutationFn: (payload: AdmitStudentPayload) => studentsApi.admit(payload),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: qk.students.all })
      toast.success(`${record.person.full_name} admitted`, {
        description: `${t('learner')} number ${record.student_number}`,
      })
      reset(BLANK)
      onClose()
    },
    onError: (error: unknown) => {
      if (!(error instanceof ApiError)) {
        toast.error('The admission could not be saved.')
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
    admit.mutate({
      person: {
        first_name: values.person.first_name.trim(),
        last_name: values.person.last_name.trim(),
        middle_name: present(values.person.middle_name),
        preferred_name: present(values.person.preferred_name),
        date_of_birth: present(values.person.date_of_birth),
        gender: present(values.person.gender),
      },
      admission_number: present(values.admission_number),
      admission_date: present(values.admission_date),
      academic_session_id: present(values.academic_session_id),
      program_id: present(values.program_id),
      academic_level_id: present(values.academic_level_id),
      learning_group_id: present(values.learning_group_id),
    })
  }

  function close() {
    if (admit.isPending) return
    reset(BLANK)
    onClose()
  }

  const errors = formState.errors

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={`Admit a ${t('learner').toLowerCase()}`}
      description={`Only the name is required. A ${t('learner').toLowerCase()} can be placed later.`}
      footer={
        <>
          <Button onClick={close} disabled={admit.isPending}>
            Cancel
          </Button>
          <Button variant="primary" form="admit-student" type="submit" loading={admit.isPending}>
            Admit
          </Button>
        </>
      }
    >
      <form id="admit-student" onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
        <section>
          <h3 className="mb-2.5 text-sm font-semibold text-gray-900">
            Name
          </h3>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="First name" required error={errors.person?.first_name?.message}>
              {(props) => <Input {...props} autoFocus {...register('person.first_name')} />}
            </Field>
            <Field label="Last name" required error={errors.person?.last_name?.message}>
              {(props) => <Input {...props} {...register('person.last_name')} />}
            </Field>
            <Field label="Middle name" error={errors.person?.middle_name?.message}>
              {(props) => <Input {...props} {...register('person.middle_name')} />}
            </Field>
            <Field
              label="Preferred name"
              hint="What they are called day to day"
              error={errors.person?.preferred_name?.message}
            >
              {(props) => <Input {...props} {...register('person.preferred_name')} />}
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-2.5 text-sm font-semibold text-gray-900">
            Record
          </h3>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Date of birth" error={errors.person?.date_of_birth?.message}>
              {(props) => (
                <Input {...props} type="date" max={today()} {...register('person.date_of_birth')} />
              )}
            </Field>
            <Field label="Gender" error={errors.person?.gender?.message}>
              {(props) => (
                <Select
                  {...props}
                  options={[
                    { value: '', label: 'Not recorded' },
                    { value: 'female', label: 'Female' },
                    { value: 'male', label: 'Male' },
                  ]}
                  {...register('person.gender')}
                />
              )}
            </Field>
            <Field
              label="Admission number"
              hint="Generated if left blank"
              error={errors.admission_number?.message}
            >
              {(props) => <Input {...props} {...register('admission_number')} />}
            </Field>
            <Field label="Admission date" error={errors.admission_date?.message}>
              {(props) => <Input {...props} type="date" {...register('admission_date')} />}
            </Field>
          </div>
        </section>

        {canPlace && (
          <section>
            <h3 className="mb-2.5 text-sm font-semibold text-gray-900">
              Placement
            </h3>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label={t('session')} error={errors.academic_session_id?.message}>
                {(props) => (
                  <Select
                    {...props}
                    options={[
                      { value: '', label: 'Not placed' },
                      ...(sessions.data ?? []).map((session) => ({
                        value: session.id,
                        label: session.is_current ? `${session.name} (current)` : session.name,
                      })),
                    ]}
                    {...register('academic_session_id')}
                  />
                )}
              </Field>
              <Field label={t('programme')} error={errors.program_id?.message}>
                {(props) => (
                  <Select
                    {...props}
                    options={[
                      { value: '', label: 'Not placed' },
                      ...(programs.data ?? []).map((program) => ({
                        value: program.id,
                        label: program.name,
                      })),
                    ]}
                    {...register('program_id')}
                  />
                )}
              </Field>
              <Field label={t('level')} error={errors.academic_level_id?.message}>
                {(props) => (
                  <Select
                    {...props}
                    options={[
                      { value: '', label: 'Not placed' },
                      ...(levels.data ?? []).map((level) => ({
                        value: level.id,
                        label: level.name,
                      })),
                    ]}
                    {...register('academic_level_id')}
                  />
                )}
              </Field>
              <Field label={t('group')} error={errors.learning_group_id?.message}>
                {(props) => (
                  <Select
                    {...props}
                    options={[
                      { value: '', label: 'Not placed' },
                      ...groupOptions.map((group) => ({ value: group.id, label: group.name })),
                    ]}
                    {...register('learning_group_id')}
                  />
                )}
              </Field>
            </div>
          </section>
        )}
      </form>
    </Modal>
  )
}
