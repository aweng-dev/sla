import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CaretRight, UsersThree } from '@phosphor-icons/react'
import { qk } from '@/shared/api/queryKeys'
import { PageStack } from '@/shared/layout/AppShell'
import { useTerminology } from '@/features/tenant/TenantProvider'
import { portalApi } from '@/features/students/students.api'
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/shared/ui'

/**
 * What a parent sees at `/guardians`.
 *
 * ── Why this screen is mostly an explanation ───────────────────────────────
 *
 * The API has no portal endpoint for guardian records. `/admin/guardians` is
 * 403 for this reader, `/portal/my-record` returns their CHILDREN and carries
 * no guardian block, and `/portal/directory` returns staff. So there is no
 * source for "the other adults on my children's records", and inventing a
 * list would be inventing data.
 *
 * The item is in this reader's rail because the API puts it there — the
 * navigation tree offers `guardians` to the guardian portal — so the screen
 * has to exist and has to be honest. It says who holds the records, shows the
 * children it CAN name, and stops. That is better than a 403 page and better
 * than a fabricated roster.
 */
export function PortalGuardiansPage() {
  const t = useTerminology()

  const record = useQuery({
    queryKey: qk.portal.myRecord(),
    queryFn: portalApi.myRecord,
  })

  if (record.isError) {
    return (
      <PageStack>
        <PageHeader title={t('guardians')} />
        <ErrorState error={record.error} onRetry={() => record.refetch()} />
      </PageStack>
    )
  }

  const children = record.data ?? []

  return (
    <PageStack>
      <PageHeader
        title={t('guardians')}
        description={`${t('guardian')} details are held by the school. Ask the office to correct anything that is out of date.`}
      />

      <Card>
        <CardHeader
          title={`Your ${t('learners').toLowerCase()}`}
          subtitle={`The records you are named on. Open one for their standing, attendance and fees.`}
        />

        {record.isLoading && (
          <div className="divide-y divide-gray-200">
            {[0, 1].map((row) => (
              <div key={row} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        )}

        {!record.isLoading && children.length === 0 && (
          <EmptyState
            icon={<UsersThree size={20} />}
            title={`No ${t('learners').toLowerCase()} are linked to you`}
            description="If that is wrong, the school office can add the link."
          />
        )}

        {!record.isLoading && children.length > 0 && (
          <ul className="divide-y divide-gray-200">
            {children.map((child) => (
              <li key={child.student_id}>
                <Link
                  to="/students/$studentId"
                  params={{ studentId: child.student_id }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <Avatar name={child.person.full_name} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900">
                      {child.person.full_name}
                    </span>
                    <span className="block truncate text-xs text-gray-600">
                      {[child.level?.name, child.learning_groups?.[0]?.name]
                        .filter(Boolean)
                        .join(' · ') || child.student_number}
                    </span>
                  </span>
                  <CaretRight size={13} className="shrink-0 text-gray-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageStack>
  )
}
