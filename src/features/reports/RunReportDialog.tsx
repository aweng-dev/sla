import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { Button, Field, Modal, Select, Skeleton } from '@/shared/ui'
import { reportKeys, reportsApi } from './reports.api'
import { ParameterFields } from './ParameterFields'
import { pruneParameters } from './reports.parameters'
import type { ReportDefinition, ReportFormat } from './reports.types'

/**
 * Run a saved report, optionally overriding its filters for this run only.
 *
 * The overrides start as the definition's own saved parameters, so the dialog
 * opens showing what WILL happen rather than an empty form the reader has to
 * reconstruct. Editing them changes this run and nothing else — the definition
 * is untouched.
 */
export function RunReportDialog({
  report,
  open,
  onClose,
  onQueued,
}: {
  report: ReportDefinition
  open: boolean
  onClose: () => void
  onQueued?: (runId: string) => void
}) {
  const queryClient = useQueryClient()
  const [format, setFormat] = useState<ReportFormat>('json')
  const [parameters, setParameters] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const datasets = useQuery({
    queryKey: reportKeys.datasets(),
    queryFn: reportsApi.datasets,
    staleTime: Infinity,
    enabled: open,
  })

  const dataset = datasets.data?.find((d) => d.id === report.dataset)

  useEffect(() => {
    if (open) {
      setParameters({ ...report.parameters })
      setErrors({})
      setFormat('json')
    }
  }, [open, report.parameters])

  const run = useMutation({
    mutationFn: () =>
      reportsApi.run(report.id, { format, parameters: pruneParameters(parameters) }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.runs(report.id) })
      queryClient.invalidateQueries({ queryKey: reportKeys.detail(report.id) })
      toast.success('Queued. It will appear below when it finishes.')
      onClose()
      onQueued?.(created.id)
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors()
        setErrors(fields)
        if (Object.keys(fields).length === 0) toast.error(error.rootMessage())
        return
      }
      toast.error('The report could not be started.')
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Run “${report.name}”`}
      description="Filters here apply to this run only. The saved report is unchanged."
      footer={
        <>
          <Button onClick={onClose} disabled={run.isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={run.isPending} onClick={() => run.mutate()}>
            Run report
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <Field
          label="Result format"
          hint={
            format === 'json'
              ? 'Readable on this screen as soon as it finishes, and downloadable.'
              : 'A spreadsheet file. Downloadable only — it cannot be previewed here.'
          }
        >
          {(props) => (
            <Select
              {...props}
              value={format}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              options={[
                { value: 'json', label: 'JSON — preview in the app' },
                { value: 'csv', label: 'CSV — spreadsheet file' },
              ]}
            />
          )}
        </Field>

        <div className="mt-2 border-t border-gray-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Filters for this run</h3>
          {datasets.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : dataset ? (
            <ParameterFields
              dataset={dataset}
              values={parameters}
              errors={errors}
              disabled={run.isPending}
              onChange={(key, value) => setParameters((prev) => ({ ...prev, [key]: value }))}
            />
          ) : (
            <p className="text-xs text-gray-600">
              This report&rsquo;s dataset is no longer published by the API, so its
              filters cannot be shown. Running it will use the saved values.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
