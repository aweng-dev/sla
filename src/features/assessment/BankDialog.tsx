import { useEffect } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { Button, Field, Input, Modal, Select, Switch, Textarea } from '@/shared/ui'
import { assessmentCatalog, assessmentKeys, banksApi } from './assessment.api'
import type { BankPayload, QuestionBankRecord } from './assessment.types'

/**
 * Creating a bank, and editing one.
 *
 * One dialog for both, because `POST /teaching/question-banks` and
 * `PUT /teaching/question-banks/{id}` take the same body — the only difference
 * is that `code` is checked for uniqueness ignoring the bank being edited.
 *
 * ── `code` is reserved even after a delete ─────────────────────────────────
 *
 * The unique index behind it has no `WHERE deleted_at IS NULL`, so a
 * soft-deleted bank keeps its code and reusing it is refused. The API turns
 * that into a message on the field rather than a 500, and this form shows it
 * where the reader typed.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Give the bank a name').max(255),
  code: z.string().trim().max(80),
  description: z.string().trim().max(5000),
  course_id: z.string(),
  academic_level_id: z.string(),
  is_shared: z.boolean(),
})

type Values = z.infer<typeof schema>

const BLANK: Values = {
  name: '',
  code: '',
  description: '',
  course_id: '',
  academic_level_id: '',
  is_shared: true,
}

function present(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function BankDialog({
  open,
  onClose,
  bank,
}: {
  open: boolean
  onClose: () => void
  bank?: QuestionBankRecord
}) {
  const t = useTerminology()
  const queryClient = useQueryClient()
  const editing = bank !== undefined

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: BLANK })
  const { formState, handleSubmit, register, reset, setError, setValue, watch } = form

  const courses = useQuery({
    queryKey: assessmentKeys.catalogCourses,
    queryFn: assessmentCatalog.courses,
    enabled: open,
    staleTime: 10 * 60_000,
  })
  const levels = useQuery({
    queryKey: assessmentKeys.catalogLevels,
    queryFn: assessmentCatalog.levels,
    enabled: open,
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    if (!open) return
    reset(
      bank
        ? {
            name: bank.name,
            code: bank.code ?? '',
            description: bank.description ?? '',
            course_id: bank.course_id ?? '',
            academic_level_id: bank.academic_level_id ?? '',
            is_shared: bank.is_shared,
          }
        : BLANK,
    )
  }, [open, bank, reset])

  const save = useMutation({
    mutationFn: (payload: BankPayload) =>
      editing ? banksApi.update(bank.id, payload) : banksApi.create(payload),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.all })
      toast.success(editing ? `${record.name} updated` : `${record.name} created`)
      onClose()
    },
    onError: (error: unknown) => {
      if (!(error instanceof ApiError)) {
        toast.error('The bank could not be saved.')
        return
      }
      const fields = error.fieldErrors()
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
      name: values.name.trim(),
      code: optional(values.code),
      description: optional(values.description),
      course_id: optional(values.course_id),
      academic_level_id: optional(values.academic_level_id),
      is_shared: values.is_shared,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit bank' : 'New question bank'}
      description={
        editing
          ? 'Changes apply to the bank, not to the questions already in it.'
          : 'A bank groups questions for one subject or year group.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={handleSubmit(submit)}
            disabled={editing && !formState.isDirty}
          >
            {editing ? 'Save changes' : 'Create bank'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-1" noValidate>
        <Field label="Name" required error={formState.errors.name?.message}>
          {(props) => (
            <Input {...props} placeholder="JSS 1 Basic Science" autoFocus {...register('name')} />
          )}
        </Field>

        <Field
          label="Code"
          hint="Unique across the institution. Stays reserved if the bank is deleted."
          error={formState.errors.code?.message}
        >
          {(props) => <Input {...props} placeholder="BSC-JSS1" {...register('code')} />}
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label={t('course')} error={formState.errors.course_id?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('course_id')}
                placeholder={courses.isLoading ? 'Loading…' : `Any ${t('course').toLowerCase()}`}
                options={[
                  { value: '', label: `Any ${t('course').toLowerCase()}` },
                  ...(courses.data ?? []).map((course) => ({
                    value: course.id,
                    label: course.code ? `${course.name} · ${course.code}` : course.name,
                  })),
                ]}
              />
            )}
          </Field>

          <Field label={t('level')} error={formState.errors.academic_level_id?.message}>
            {(props) => (
              <Select
                {...props}
                {...register('academic_level_id')}
                placeholder={levels.isLoading ? 'Loading…' : `Any ${t('level').toLowerCase()}`}
                options={[
                  { value: '', label: `Any ${t('level').toLowerCase()}` },
                  ...(levels.data ?? []).map((level) => ({ value: level.id, label: level.name })),
                ]}
              />
            )}
          </Field>
        </div>

        <Field label="Description" error={formState.errors.description?.message}>
          {(props) => (
            <Textarea {...props} rows={2} placeholder="What this bank covers." {...register('description')} />
          )}
        </Field>

        <label className="flex items-start gap-2.5 pt-1">
          <Switch
            checked={watch('is_shared')}
            onChange={(next) => setValue('is_shared', next, { shouldDirty: true })}
            label="Share with all teachers"
          />
          <span className="text-sm text-gray-800">
            Share with all {t('teachers').toLowerCase()}
            <span className="block text-xs text-gray-600">
              A private bank is visible only to the person who owns it.
            </span>
          </span>
        </label>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  )
}
