import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { coursesApi, offeringsApi } from '@/features/academics/academics.api'
import { academicsKeys } from '@/features/academics/academics.keys'
import { lessonsApi, type LearningModule } from '../lessons.api'

/**
 * Writing a unit, or renaming one.
 *
 * ── The owner is chosen once and never moved ───────────────────────────────
 *
 * A new unit belongs either to a COURSE — the syllabus, the same in September
 * as in January — or to ONE RUNNING of it, which is this term's brief for this
 * class. The API has two create endpoints for exactly that, and no endpoint at
 * all for moving a unit between them: moving it would take its lessons with it
 * and change who can see them, which is not what renaming means.
 *
 * So the owner picker appears on a new unit and disappears on an existing one.
 */
export function UnitDialog({
  open,
  unit,
  onClose,
  onSaved,
}: {
  open: boolean
  /** An existing unit being renamed, or null for a new one. */
  unit: LearningModule | null
  onClose: () => void
  onSaved: (unit: LearningModule) => void
}) {
  const t = useTerminology()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ownerKind, setOwnerKind] = useState<'course' | 'course_offering'>('course_offering')
  const [ownerId, setOwnerId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setTitle(unit?.title ?? '')
    setDescription(unit?.description ?? '')
    setOwnerKind(unit?.owner_kind ?? 'course_offering')
    setOwnerId(unit?.course_offering_id ?? unit?.course_id ?? '')
  }, [open, unit])

  const courses = useQuery({
    queryKey: academicsKeys.courses.list({ per_page: 200 }),
    queryFn: () => coursesApi.list({ per_page: 200 }),
    enabled: open && unit === null,
    staleTime: 5 * 60 * 1000,
  })

  const offerings = useQuery({
    queryKey: academicsKeys.offerings.list({ per_page: 200 }),
    queryFn: () => offeringsApi.list({ per_page: 200 }),
    enabled: open && unit === null,
    staleTime: 5 * 60 * 1000,
  })

  const save = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim(), description: description.trim() || null }

      if (unit) return lessonsApi.updateModule(unit.id, payload)

      return ownerKind === 'course'
        ? lessonsApi.createForCourse(ownerId, payload)
        : lessonsApi.createForOffering(ownerId, payload)
    },
    onSuccess: (saved) => {
      toast.success(unit ? 'Saved.' : 'Unit created as a draft. Nobody can see it yet.')
      onSaved(saved)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('That unit was not saved.')
    },
  })

  const ready = title.trim() !== '' && (unit !== null || ownerId !== '')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={unit ? 'Rename this unit' : 'New unit'}
      description={
        unit
          ? undefined
          : 'A unit is a folder. Its lessons are written inside it and published one at a time.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!ready}
            onClick={() => save.mutate()}
          >
            {unit ? 'Save' : 'Create unit'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Title" required error={errors.title}>
          {(props) => (
            <Input
              {...props}
              value={title}
              maxLength={255}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          )}
        </Field>

        <Field label="Description" error={errors.description}>
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={description}
              maxLength={20000}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          )}
        </Field>

        {unit === null && (
          <>
            <Field
              label="Belongs to"
              hint={
                ownerKind === 'course'
                  ? `Shared material. Every running of the ${t('course').toLowerCase()} gets it.`
                  : `Just this class, this session.`
              }
            >
              {(props) => (
                <Select
                  {...props}
                  value={ownerKind}
                  onChange={(event) => {
                    setOwnerKind(event.currentTarget.value as 'course' | 'course_offering')
                    setOwnerId('')
                  }}
                  options={[
                    { value: 'course_offering', label: `One class this session` },
                    { value: 'course', label: `The ${t('course').toLowerCase()} itself` },
                  ]}
                />
              )}
            </Field>

            <Field
              label={ownerKind === 'course' ? t('course') : `${t('course')} offering`}
              required
              error={errors.course_id ?? errors.course_offering_id}
            >
              {(props) => (
                <Select
                  {...props}
                  value={ownerId}
                  onChange={(event) => setOwnerId(event.currentTarget.value)}
                  placeholder="Choose one"
                  options={
                    ownerKind === 'course'
                      ? (courses.data?.rows ?? []).map((course) => ({
                          value: course.id,
                          label: course.code ? `${course.title} (${course.code})` : course.title,
                        }))
                      : (offerings.data?.rows ?? []).map((offering) => ({
                          value: offering.id,
                          label: `${offering.course_title} · ${offering.code}`,
                        }))
                  }
                />
              )}
            </Field>
          </>
        )}
      </div>
    </Modal>
  )
}
