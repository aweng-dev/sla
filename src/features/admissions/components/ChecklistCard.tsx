import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, DownloadSimple, FileArrowUp, Warning, XCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardHeader, ErrorState, Skeleton } from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDate, humanize } from '@/shared/lib/format'
import {
  admissionKeys,
  admissionsApi,
  type ApplicationDocument,
  type ChecklistItem,
} from '../admissions.api'

/**
 * What this intake requires, and what has actually arrived.
 *
 * ── The checklist is the API's answer, joined server-side ──────────────────
 *
 * Required documents live on the CYCLE; uploads live on the application. The
 * checklist endpoint joins them and says, per requirement, whether it is
 * provided and whether it is SATISFIED. Those are two different facts — a
 * birth certificate can be uploaded and rejected — and only the second one
 * gates a decision.
 *
 * Nothing here recomputes that. A screen that compared the cycle's list against
 * the upload list would be a second implementation of the rule, and it would go
 * wrong the first time "verified" stopped being the only satisfying state.
 *
 * ── Uploads and downloads both go through the API ──────────────────────────
 *
 * The resource emits no storage path, deliberately, so a document is fetched as
 * bytes against the reader's right to the application rather than through a link
 * that would outlive it. The object URL is revoked as soon as the browser has
 * taken the file.
 */
export function ChecklistCard({
  applicationId,
  canVerify,
  canUpload,
}: {
  applicationId: string
  canVerify: boolean
  canUpload: boolean
}) {
  const queryClient = useQueryClient()
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const checklist = useQuery({
    queryKey: admissionKeys.checklist(applicationId),
    queryFn: () => admissionsApi.checklist(applicationId),
  })

  const documents = useQuery({
    queryKey: [...admissionKeys.application(applicationId), 'documents'],
    queryFn: () => admissionsApi.documents(applicationId),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: admissionKeys.checklist(applicationId) })
    queryClient.invalidateQueries({ queryKey: admissionKeys.application(applicationId) })
  }

  const upload = useMutation({
    mutationFn: ({ file, type }: { file: File; type: string }) =>
      admissionsApi.uploadDocument(applicationId, file, type),
    onSuccess: () => {
      refresh()
      toast.success('Uploaded. It still needs verifying.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That file was not accepted.')
    },
    onSettled: () => setUploadingType(null),
  })

  const verify = useMutation({
    mutationFn: ({
      documentId,
      status,
    }: {
      documentId: string
      status: 'verified' | 'rejected'
    }) =>
      admissionsApi.verifyDocument(applicationId, documentId, { verification_status: status }),
    onSuccess: (_result, variables) => {
      refresh()
      toast.success(variables.status === 'verified' ? 'Verified.' : 'Marked as rejected.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be saved.')
    },
  })

  const byId = new Map((documents.data ?? []).map((doc) => [doc.id, doc]))
  const items = checklist.data?.items ?? []

  /* Uploads that are not on the required list still belong on screen — a
   * reference somebody sent unprompted is part of the file. */
  const requiredIds = new Set(items.map((item) => item.application_document_id).filter(Boolean))
  const extras = (documents.data ?? []).filter((doc) => !requiredIds.has(doc.id))

  return (
    <Card>
      <CardHeader
        title="Documents"
        subtitle={
          checklist.data
            ? checklist.data.is_complete
              ? 'Everything this intake asks for is verified'
              : `${checklist.data.outstanding.length} still outstanding`
            : undefined
        }
        actions={
          checklist.data ? (
            checklist.data.is_complete ? (
              <Badge tone="success">Complete</Badge>
            ) : (
              <Badge tone="warning">Incomplete</Badge>
            )
          ) : undefined
        }
      />

      {/* One input, retargeted per row. A file picker per requirement would be
        * a dozen hidden inputs on a page that only ever uses one at a time. */}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file && uploadingType) upload.mutate({ file, type: uploadingType })
          event.currentTarget.value = ''
        }}
      />

      {checklist.isError ? (
        <ErrorState error={checklist.error} onRetry={() => checklist.refetch()} />
      ) : checklist.isLoading ? (
        <div className="space-y-2 p-4" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : items.length === 0 && extras.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-gray-500">
          This intake asks for no documents.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {items.map((item) => (
            <li key={item.document_type}>
              <ChecklistRow
                item={item}
                document={
                  item.application_document_id ? byId.get(item.application_document_id) : undefined
                }
                applicationId={applicationId}
                canVerify={canVerify}
                canUpload={canUpload}
                uploading={upload.isPending && uploadingType === item.document_type}
                verifying={
                  verify.isPending && verify.variables?.documentId === item.application_document_id
                }
                onUpload={() => {
                  setUploadingType(item.document_type)
                  fileInput.current?.click()
                }}
                onVerify={(status) =>
                  item.application_document_id &&
                  verify.mutate({ documentId: item.application_document_id, status })
                }
              />
            </li>
          ))}

          {extras.map((doc) => (
            <li key={doc.id}>
              <ChecklistRow
                item={{
                  document_type: doc.document_type,
                  is_provided: true,
                  is_satisfied: doc.verification_status === 'verified',
                  status: doc.verification_status,
                  application_document_id: doc.id,
                }}
                document={doc}
                applicationId={applicationId}
                extra
                canVerify={canVerify}
                canUpload={false}
                uploading={false}
                verifying={verify.isPending && verify.variables?.documentId === doc.id}
                onUpload={() => {}}
                onVerify={(status) => verify.mutate({ documentId: doc.id, status })}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ChecklistRow({
  item,
  document: doc,
  applicationId,
  extra,
  canVerify,
  canUpload,
  uploading,
  verifying,
  onUpload,
  onVerify,
}: {
  item: ChecklistItem
  document?: ApplicationDocument
  applicationId: string
  extra?: boolean
  canVerify: boolean
  canUpload: boolean
  uploading: boolean
  verifying: boolean
  onUpload: () => void
  onVerify: (status: 'verified' | 'rejected') => void
}) {
  const [downloading, setDownloading] = useState(false)

  async function download() {
    if (!doc) return
    setDownloading(true)
    try {
      const blob = await admissionsApi.downloadDocument(applicationId, doc.id)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = doc.file_name
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.rootMessage() : 'That file could not be downloaded.',
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {item.is_satisfied ? (
          <CheckCircle size={16} weight="fill" className="text-success-500" />
        ) : item.is_provided ? (
          <Warning size={16} weight="fill" className="text-brand-500" />
        ) : (
          <XCircle size={16} className="text-gray-300" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm text-gray-900">
          {humanize(item.document_type)}
          {extra && <Badge tone="neutral">Extra</Badge>}
        </p>
        <p className="mt-0.5 truncate text-2xs text-gray-600">
          {doc
            ? `${doc.file_name} · ${doc.verification_status_label}${
                doc.verified_at ? ` ${formatDate(doc.verified_at)}` : ''
              }`
            : 'Not provided'}
          {doc?.verification_note && ` · ${doc.verification_note}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {doc && (
          <Button
            size="sm"
            variant="ghost"
            icon={<DownloadSimple size={14} />}
            loading={downloading}
            onClick={download}
          >
            Open
          </Button>
        )}

        {doc && canVerify && item.status !== 'verified' && (
          <Button size="sm" variant="ghost" loading={verifying} onClick={() => onVerify('verified')}>
            Verify
          </Button>
        )}

        {doc && canVerify && item.status !== 'rejected' && (
          <Button size="sm" variant="ghost" loading={verifying} onClick={() => onVerify('rejected')}>
            Reject
          </Button>
        )}

        {!doc && canUpload && (
          <Button
            size="sm"
            variant="ghost"
            icon={<FileArrowUp size={14} />}
            loading={uploading}
            onClick={onUpload}
          >
            Upload
          </Button>
        )}
      </div>
    </div>
  )
}
