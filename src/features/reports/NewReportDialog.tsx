import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { Button, Field, Input, Modal, Select, Skeleton, Textarea } from '@/shared/ui'
import { reportKeys, reportsApi } from './reports.api'
import { ColumnPicker, ParameterFields } from './ParameterFields'
import { pruneParameters } from './reports.parameters'
import type { ReportDatasetId, ReportVisibility } from './reports.types'

/**
 * Saving a question so it can be asked again.
 *
 * The form is driven entirely by the chosen dataset: its columns become the
 * column picker, its parameters become the filter fields. Changing the dataset
 * therefore has to clear both — a `program_id` carried over from the student
 * roster means nothing to the staff roster, and the API would reject it.
 */
export function NewReportDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const queryClient = useQueryClient()

  const datasets = useQuery({
    queryKey: reportKeys.datasets(),
    queryFn: reportsApi.datasets,
    /* A server-side enum. It does not change between deploys. */
    staleTime: Infinity,
    enabled: open,
  })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [datasetId, setDatasetId] = useState<ReportDatasetId | ''>('')
  const [visibility, setVisibility] = useState<ReportVisibility>('shared')
  const [columns, setColumns] = useState<string[]>([])
  const [parameters, setParameters] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const dataset = datasets.data?.find((d) => d.id === datasetId)

  /* The dataset decides what the rest of the form means. */
  useEffect(() => {
    setColumns([])
    setParameters({})
  }, [datasetId])

  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setDatasetId('')
      setVisibility('shared')
      setColumns([])
      setParameters({})
      setErrors({})
    }
  }, [open])

  const create = useMutation({
    mutationFn: () =>
      reportsApi.create({
        name: name.trim(),
        description: description.trim() || null,
        dataset: datasetId as ReportDatasetId,
        columns: columns.length > 0 ? columns : undefined,
        parameters: pruneParameters(parameters),
        visibility,
      }),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.all })
      toast.success(`“${report.name}” saved`)
      onClose()
      onCreated?.(report.id)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The report could not be saved.')
    },
  })

  const canSave = name.trim().length > 0 && datasetId !== '' && !create.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New report"
      description="A saved question you can run again, share, and schedule."
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={create.isPending}
            onClick={() => {
              setErrors({})
              create.mutate()
            }}
          >
            Save report
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field label="Name" required error={errors.name}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Learners below 80% attendance"
              autoFocus
            />
          )}
        </Field>

        <Field
          label="Description"
          hint="What the report is for. Shown to anyone it is shared with."
          error={errors.description}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>

        {datasets.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <Field
            label="Dataset"
            required
            error={errors.dataset}
            hint={dataset?.description}
          >
            {(props) => (
              <Select
                {...props}
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value as ReportDatasetId)}
                placeholder="Choose what to report on"
                options={(datasets.data ?? []).map((d) => ({ value: d.id, label: d.label }))}
              />
            )}
          </Field>
        )}

        {dataset && (
          <>
            <div className="mt-2 border-t border-gray-200 pt-4">
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Filters</h3>
              <p className="mb-3 text-xs text-gray-600">
                Saved with the report. Anyone running it can override them for a
                single run.
              </p>
              <ParameterFields
                dataset={dataset}
                values={parameters}
                errors={errors}
                onChange={(key, value) =>
                  setParameters((prev) => ({ ...prev, [key]: value }))
                }
              />
            </div>

            <div className="mt-2 border-t border-gray-200 pt-4">
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Columns</h3>
              <p className="mb-3 text-xs text-gray-600">
                Leave every column on to keep the report in step with the dataset
                as it grows.
              </p>
              <ColumnPicker dataset={dataset} selected={columns} onChange={setColumns} />
            </div>

            <div className="mt-4 border-t border-gray-200 pt-4">
              <Field
                label="Visibility"
                error={errors.visibility}
                hint={
                  visibility === 'shared'
                    ? 'Everyone who can reach reports sees it. Each of them runs it against their own access, so two people can get different rows.'
                    : 'Only you see it.'
                }
              >
                {(props) => (
                  <Select
                    {...props}
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as ReportVisibility)}
                    options={[
                      { value: 'shared', label: 'Shared with the institution' },
                      { value: 'private', label: 'Private to me' },
                    ]}
                  />
                )}
              </Field>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
