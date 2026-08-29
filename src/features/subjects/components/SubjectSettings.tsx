import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Archive } from '@phosphor-icons/react'
import {
  Button,
  Card,
  CardFooter,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '@/shared/ui'
import { humanize } from '@/shared/lib/format'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { coursesApi, type CoursePayload } from '@/features/academics/academics.api'
import { ACADEMIC_FANOUT, academicsKeys } from '@/features/academics/academics.keys'
import { FieldRow } from '@/features/academics/components/FormDialog'
import { reportError, useServerErrors } from '@/features/academics/components/useServerErrors'
import { useUnitCatalog } from '@/features/academics/components/pickers'
import type { Course } from '@/features/academics/academics.types'

/**
 * The catalogue entry itself.
 *
 * ── A form on the page, not in a dialog ────────────────────────────────────
 *
 * The list screen edits a subject in a modal, which is right there: you are
 * changing one row of many and going back to the list. Here you are ON the
 * subject, and a dialog would cover the page you are editing to edit it.
 *
 * ── Archive is the only way out, and it says why ───────────────────────────
 *
 * The API offers no delete. A subject with offerings, marks and results behind
 * it cannot be removed without breaking every record that names it — so the
 * destructive section says that rather than leaving somebody hunting for a
 * delete button that was deliberately not built.
 */

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title'),
  code: z.string().trim().min(1, 'Enter a code'),
  course_type: z.string().trim().optional(),
  credit_units: z.string().optional(),
  contact_hours: z.string().optional(),
  organizational_unit_id: z.string().optional(),
  description: z.string().optional(),
})

type Values = z.infer<typeof schema>

function toValues(subject: Course): Values {
  return {
    title: subject.title,
    code: subject.code,
    course_type: subject.course_type ?? '',
    credit_units: subject.credit_units === null ? '' : String(subject.credit_units),
    contact_hours: subject.contact_hours === null ? '' : String(subject.contact_hours),
    organizational_unit_id: subject.organizational_unit?.id ?? '',
    description: subject.description ?? '',
  }
}

export function SubjectSettings({ subject }: { subject: Course }) {
  const t = useTerminology()
  const { access } = useTenant()
  const queryClient = useQueryClient()

  const supportsUnits = access?.institution.supports_organizational_units ?? false
  const showCredits = access?.institution.supports_credit_system ?? false
  const units = useUnitCatalog(supportsUnits)

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(subject) })
  const applyServerErrors = useServerErrors(form)

  /* The record can change under the form — somebody archives it in another
   * tab, or the workspace refetches after a curriculum action. Resetting on
   * identity keeps the fields honest without discarding an edit in progress. */
  useEffect(() => {
    form.reset(toValues(subject))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.id, subject.updated_at])

  function settle(message: string) {
    queryClient.invalidateQueries({ queryKey: academicsKeys.courses.all })
    for (const key of ACADEMIC_FANOUT) queryClient.invalidateQueries({ queryKey: key })
    toast.success(message)
  }

  const save = useMutation({
    mutationFn: (values: Values) => {
      const payload: CoursePayload = {
        title: values.title.trim(),
        code: values.code.trim(),
        course_type: values.course_type?.trim() || null,
        credit_units: values.credit_units ? Number(values.credit_units) : null,
        contact_hours: values.contact_hours ? Number(values.contact_hours) : null,
        organizational_unit_id: values.organizational_unit_id || null,
        description: values.description?.trim() || null,
      }

      return coursesApi.update(subject.id, payload)
    },
    onSuccess: () => settle('Saved'),
    onError: applyServerErrors,
  })

  const archive = useMutation({
    mutationFn: () => coursesApi.archive(subject.id),
    onSuccess: () => settle(`${subject.title} archived`),
    onError: (error) => reportError(error),
  })

  const canSave = !subject.can_manage ? false : form.formState.isDirty && !save.isPending

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        <Card>
          <CardHeader
            title={`${t('course')} details`}
            subtitle="Changing these changes what every class taking it is called. It does not touch any curriculum."
          />

          <div className="flex flex-col gap-4 p-4">
            <FieldRow>
              <Field label="Title" required error={form.formState.errors.title?.message}>
                {(props) => <Input {...props} {...form.register('title')} />}
              </Field>
              <Field label="Code" required error={form.formState.errors.code?.message}>
                {(props) => <Input {...props} {...form.register('code')} />}
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Kind" error={form.formState.errors.course_type?.message}>
                {(props) => <Input {...props} placeholder="core" {...form.register('course_type')} />}
              </Field>
              <Field label="Contact hours" error={form.formState.errors.contact_hours?.message}>
                {(props) => (
                  <Input {...props} type="number" min={0} {...form.register('contact_hours')} />
                )}
              </Field>
            </FieldRow>

            {showCredits && (
              <Field label="Credit units" error={form.formState.errors.credit_units?.message}>
                {(props) => (
                  <Input {...props} type="number" min={0} {...form.register('credit_units')} />
                )}
              </Field>
            )}

            {supportsUnits && (
              <Field
                label={humanize(access?.institution.organizational_unit_noun ?? 'department')}
                error={form.formState.errors.organizational_unit_id?.message}
              >
                {(props) => (
                  <Select
                    {...props}
                    options={[{ value: '', label: 'None' }, ...units.options]}
                    {...form.register('organizational_unit_id')}
                  />
                )}
              </Field>
            )}

            <Field label="Description" error={form.formState.errors.description?.message}>
              {(props) => <Textarea {...props} rows={4} {...form.register('description')} />}
            </Field>
          </div>

          <CardFooter>
            <Button
              type="button"
              onClick={() => form.reset(toValues(subject))}
              disabled={!form.formState.isDirty || save.isPending}
            >
              Discard changes
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!canSave}>
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </form>

      {subject.status !== 'archived' && subject.can_manage && (
        <Card>
          <CardHeader
            title="Archive"
            subtitle="It stops being offered to new classes. Everything already taught, marked or reported keeps naming it."
          />
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-gray-600">
              There is no delete. A {t('course').toLowerCase()} with marks behind it cannot be
              removed without breaking the records that name it.
            </p>
            <Button
              icon={<Archive size={15} />}
              loading={archive.isPending}
              onClick={() => archive.mutate()}
            >
              Archive {subject.title}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
