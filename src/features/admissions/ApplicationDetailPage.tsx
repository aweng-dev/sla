import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, FileText, PaperPlaneTilt, Prohibit } from '@phosphor-icons/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageStack } from '@/shared/layout/AppShell'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EntityIcon,
  ErrorState,
  Fact,
  Facts,
  PageHeader,
  ReasonDialog,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { ApiError } from '@/shared/api/envelope'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { usePermissions, useTerminology } from '@/features/tenant/TenantProvider'
import { programsApi } from '@/features/academics/academics.api'
import { academicsKeys } from '@/features/academics/academics.keys'
import { ChecklistCard } from './components/ChecklistCard'
import { InterviewsCard } from './components/InterviewsCard'
import { OffersCard } from './components/OffersCard'
import { ReviewsCard } from './components/ReviewsCard'
import { admissionKeys, admissionsApi } from './admissions.api'

/**
 * One application, whole.
 *
 * ── A route rather than a drawer ───────────────────────────────────────────
 *
 * An admissions file is passed between people — "look at 2026/0412 before the
 * panel" — so it needs an address somebody can send. A drawer over the queue
 * cannot be linked to, cannot be opened in a second tab beside another
 * candidate, and loses its place on a refresh.
 *
 * ── The evidence on the left, the decision on the right ────────────────────
 *
 * Documents, reviews and interviews are what somebody reads. The offer is what
 * they do about it, and it sits apart in its own rail, because a decision button
 * mixed into a list of notes gets pressed while reading rather than after.
 *
 * ── Every gate is the API's ────────────────────────────────────────────────
 *
 * `is_editable` and `is_final` come down on the application; nothing here
 * re-derives them from the status. Submit is offered only while the API says the
 * application can still change, and the closing actions disappear once it says
 * the file is closed.
 */
export function ApplicationDetailPage() {
  const { applicationId } = useParams({ from: '/app/admissions/$applicationId' })
  const permissions = usePermissions()
  const t = useTerminology()
  const queryClient = useQueryClient()

  const [rejecting, setRejecting] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  /*
   * Three gates, matching the three the policy actually uses.
   *
   * `admissions.manage` is the WORKING half — verifying a document, writing a
   * review, booking an interview, submitting, withdrawing. `admissions.decisions`
   * is the deciding half — rejecting, offering, converting — and the policy's own
   * comment notes that nothing grants it by default. Drawing them from one flag
   * would put an offer button in front of everybody who can file a document.
   */
  const canWork = permissions.has('admissions.manage')
  const canDecide = permissions.has('admissions.decisions')

  const application = useQuery({
    queryKey: admissionKeys.application(applicationId),
    queryFn: () => admissionsApi.application(applicationId),
  })

  /*
   * A choice carries a `program_id` and nothing else, so without this the rail
   * reads out UUIDs. The catalogue is small, cached under the academics key the
   * rest of the app already uses, and shared with any other screen that has
   * loaded it — so this is usually free.
   */
  const programs = useQuery({
    queryKey: academicsKeys.programs.list({ per_page: 200 }),
    queryFn: () => programsApi.list({ per_page: 200 }),
    staleTime: 5 * 60 * 1000,
  })

  const programNames = new Map(
    (programs.data?.rows ?? []).map((program) => [program.id, program.name]),
  )

  function refresh() {
    queryClient.invalidateQueries({ queryKey: admissionKeys.root })
  }

  const submit = useMutation({
    mutationFn: () => admissionsApi.submit(applicationId),
    onSuccess: () => {
      refresh()
      toast.success('Submitted. The choices are now fixed.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be submitted.')
    },
  })

  const reject = useMutation({
    mutationFn: (reason: string) => admissionsApi.reject(applicationId, reason),
    onSuccess: () => {
      refresh()
      setRejecting(false)
      toast.success('Rejected.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be rejected.')
    },
  })

  const withdraw = useMutation({
    mutationFn: (reason: string) => admissionsApi.withdraw(applicationId, reason),
    onSuccess: () => {
      refresh()
      setWithdrawing(false)
      toast.success('Withdrawn.')
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.rootMessage() : 'That could not be withdrawn.')
    },
  })

  if (application.isError) {
    return (
      <PageStack>
        <BackLink />
        <Card>
          <ErrorState error={application.error} onRetry={() => application.refetch()} />
        </Card>
      </PageStack>
    )
  }

  if (application.isLoading || !application.data) {
    return (
      <PageStack>
        <BackLink />
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      </PageStack>
    )
  }

  const row = application.data
  const name = row.applicant?.name || row.applicant?.applicant_number || 'Unnamed applicant'

  return (
    <PageStack>
      <BackLink />

      <PageHeader
        title={name}
        icon={
          <EntityIcon>
            <FileText size={18} />
          </EntityIcon>
        }
        meta={<span className="tabular">Application {row.application_number}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {row.is_editable && canWork && (
              <Button
                variant="primary"
                icon={<PaperPlaneTilt size={15} />}
                loading={submit.isPending}
                onClick={() => submit.mutate()}
              >
                Submit
              </Button>
            )}
            {!row.is_final && canDecide && (
              <Button icon={<Prohibit size={15} />} onClick={() => setRejecting(true)}>
                Reject
              </Button>
            )}
            {!row.is_final && canWork && (
              <Button onClick={() => setWithdrawing(true)}>Withdraw</Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* ── The evidence ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <ChecklistCard applicationId={applicationId} canVerify={canWork} canUpload={canWork} />
          <ReviewsCard applicationId={applicationId} canReview={canWork} />
          <InterviewsCard applicationId={applicationId} canSchedule={canWork} />
        </div>

        {/* ── The decision ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              title="Where it stands"
              actions={
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.status} />
                  {row.is_final && <Badge tone="neutral">Closed</Badge>}
                </div>
              }
            />
            <Facts>
              <Fact label="Submitted">
                {row.submitted_at ? formatDateTime(row.submitted_at) : 'Not yet'}
              </Fact>
              <Fact label="Decided">
                {row.decided_at ? formatDateTime(row.decided_at) : 'Not yet'}
              </Fact>
              <Fact label="Can still be changed">{row.is_editable ? 'Yes' : 'No'}</Fact>
            </Facts>
          </Card>

          <Card>
            <CardHeader
              title="Choices"
              subtitle={
                row.choices === undefined
                  ? undefined
                  : `${formatNumber(row.choices.length)} ${t('programmes').toLowerCase()}, in order of preference`
              }
            />
            {row.choices === undefined || row.choices.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-500">
                No choices have been set. An application is submitted against at least one.
              </p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {row.choices
                  .slice()
                  .sort((a, b) => a.priority - b.priority)
                  .map((choice) => (
                    <li key={choice.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-5 shrink-0 text-right text-2xs text-gray-500 tabular">
                        {choice.priority}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                        {/* The name where the catalogue has landed; the id is a
                          * poor label but a truthful one until it does. */}
                        {programNames.get(choice.program_id) ?? choice.program_id}
                      </span>
                      <StatusBadge status={choice.status} />
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <OffersCard applicationId={applicationId} canDecide={canDecide} />
        </div>
      </div>

      <ReasonDialog
        open={rejecting}
        title="Reject this application"
        description="The applicant is told. The reason is kept on the file, and this closes it."
        confirmLabel="Reject"
        destructive
        pending={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => reject.mutate(reason)}
      />

      <ReasonDialog
        open={withdrawing}
        title="Withdraw this application"
        description="Use this when the applicant has pulled out. Rejecting is the institution's decision; withdrawing is theirs."
        confirmLabel="Withdraw"
        pending={withdraw.isPending}
        onClose={() => setWithdrawing(false)}
        onConfirm={(reason) => withdraw.mutate(reason)}
      />
    </PageStack>
  )
}

function BackLink() {
  return (
    <Link
      to="/admissions"
      className="inline-flex w-fit items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
    >
      <ArrowLeft size={13} />
      Back to the pipeline
    </Link>
  )
}
