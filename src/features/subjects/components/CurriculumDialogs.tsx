import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Field, Input, Select, Textarea } from '@/shared/ui'
import { FieldRow, FormDialog } from '@/features/academics/components/FormDialog'
import { useServerErrors } from '@/features/academics/components/useServerErrors'
import type { OfferingCurriculum } from '../curriculum.api'
import type { SubjectClass } from '../useSubjectWorkspace'

/* ── Starting one ────────────────────────────────────────────────────────── */

const createSchema = z.object({
  title: z.string().trim().min(1, 'Give it a title'),
  version: z.string().trim().max(60).optional(),
  summary: z.string().optional(),
})

export type CreateCurriculumValues = z.infer<typeof createSchema>

/**
 * A new scheme of work for ONE class.
 *
 * The class is not a field: this dialog is opened from a class row and the
 * offering is what it is opened with. Offering a picker here would be offering
 * a way to write the wrong class's document from the right class's row.
 *
 * `version` is free text because a school's own names for versions — "v1",
 * "2026 revision", "post-inspection" — are not ours to enumerate. It is unique
 * per class per subject, so the server refuses a repeat with a 409 rather than
 * quietly making a second document with the same name.
 */
export function CreateCurriculumDialog({
  open,
  onClose,
  onSubmit,
  pending,
  className,
  subjectTitle,
  suggestedTitle,
  error,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (values: CreateCurriculumValues) => void
  pending: boolean
  /** The class this will belong to, named so nobody writes into the wrong one. */
  className: string
  subjectTitle: string
  suggestedTitle: string
  error: unknown
}) {
  const form = useForm<CreateCurriculumValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { title: suggestedTitle, version: 'v1', summary: '' },
  })
  const applyServerErrors = useServerErrors(form)

  /* The suggestion depends on which class was clicked, and the dialog is one
   * component reused across rows. */
  useEffect(() => {
    if (open) form.reset({ title: suggestedTitle, version: 'v1', summary: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestedTitle])

  useEffect(() => {
    if (error) applyServerErrors(error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`New curriculum for ${className}`}
      description={`${subjectTitle}, as this ${className} is taught it. Other classes taking ${subjectTitle} are not affected.`}
      form={form}
      onSubmit={onSubmit}
      pending={pending}
      submitLabel="Create"
    >
      <Field label="Title" required error={form.formState.errors.title?.message}>
        {(props) => <Input {...props} autoFocus {...form.register('title')} />}
      </Field>

      <Field
        label="Version"
        hint="Your own name for it. Must be different from this class's other versions of this subject."
        error={form.formState.errors.version?.message}
      >
        {(props) => <Input {...props} placeholder="v1" {...form.register('version')} />}
      </Field>

      <Field label="Summary" error={form.formState.errors.summary?.message}>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            placeholder="What this class covers this term."
            {...form.register('summary')}
          />
        )}
      </Field>
    </FormDialog>
  )
}

/* ── Copying one onto another class ──────────────────────────────────────── */

const duplicateSchema = z.object({
  course_offering_id: z.string().min(1, 'Choose a class'),
  title: z.string().trim().optional(),
  version: z.string().trim().max(60).optional(),
})

export type DuplicateCurriculumValues = z.infer<typeof duplicateSchema>

/**
 * Copy a scheme of work onto another class.
 *
 * ── The copy is independent, and the wording says so ───────────────────────
 *
 * Every unit and lesson is inserted afresh on the server. Editing the copy
 * cannot reach the original, which is the whole reason somebody duplicates
 * rather than shares — and it is worth stating, because "duplicate" in other
 * tools sometimes means "link".
 *
 * ── Only classes that actually take this subject ───────────────────────────
 *
 * The list is the subject's own offerings, and the server checks the same thing
 * again: a target teaching a different subject is refused with a 409. A picker
 * of every class in the school would be a picker mostly of wrong answers.
 */
export function DuplicateCurriculumDialog({
  open,
  onClose,
  onSubmit,
  pending,
  source,
  targets,
  error,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (values: DuplicateCurriculumValues) => void
  pending: boolean
  source: OfferingCurriculum | null
  /** Every class taking this subject, minus the one it came from. */
  targets: SubjectClass[]
  error: unknown
}) {
  const form = useForm<DuplicateCurriculumValues>({
    resolver: zodResolver(duplicateSchema),
    defaultValues: { course_offering_id: '', title: '', version: '' },
  })
  const applyServerErrors = useServerErrors(form)

  useEffect(() => {
    if (open) form.reset({ course_offering_id: '', title: source?.title ?? '', version: 'v1' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source?.id])

  useEffect(() => {
    if (error) applyServerErrors(error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const options = targets
    .filter((entry) => entry.offering.id !== source?.course_offering_id)
    .map((entry) => ({
      value: entry.offering.id,
      label: [
        entry.offering.learning_group_name ?? entry.offering.code,
        entry.offering.academic_period_name,
        entry.headline ? `has ${entry.curricula.length}` : 'nothing yet',
      ]
        .filter(Boolean)
        .join(' · '),
    }))

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Duplicate this curriculum"
      description={
        source
          ? `A full copy of “${source.title}” for another class. It starts as a draft, and editing it never changes ${source.learning_group_name ?? 'the original'}’s.`
          : undefined
      }
      form={form}
      onSubmit={onSubmit}
      pending={pending}
      submitLabel="Duplicate"
    >
      <Field
        label="Copy it to"
        required
        hint={
          options.length === 0
            ? 'No other class is taking this subject in the selected session and term.'
            : undefined
        }
        error={form.formState.errors.course_offering_id?.message}
      >
        {(props) => (
          <Select
            {...props}
            options={[{ value: '', label: 'Choose a class' }, ...options]}
            disabled={options.length === 0}
            {...form.register('course_offering_id')}
          />
        )}
      </Field>

      <FieldRow>
        <Field label="Title" error={form.formState.errors.title?.message}>
          {(props) => <Input {...props} {...form.register('title')} />}
        </Field>
        <Field label="Version" error={form.formState.errors.version?.message}>
          {(props) => <Input {...props} placeholder="v1" {...form.register('version')} />}
        </Field>
      </FieldRow>
    </FormDialog>
  )
}
