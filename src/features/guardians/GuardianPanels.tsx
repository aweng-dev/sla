import { useQuery } from '@tanstack/react-query'
import { Student, UsersThree } from '@phosphor-icons/react'
import { formatDate, humanize } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Blank,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Fact,
  Facts,
  Flag,
  Skeleton,
  StatusBadge,
  type Column,
} from '@/shared/ui'
import { guardianKeys, guardiansApi } from './guardians.api'
import type { GuardianChildLink, GuardianRecord } from './guardians.types'

/**
 * The two panels behind the record's tabs.
 *
 * Children owns its own request and is only asked for when its tab is open —
 * a record screen that fetches every child to show a name is a round trip for
 * an answer nobody asked for.
 */

/* ── Overview ────────────────────────────────────────────────────────────── */

export function GuardianOverview({ record }: { record: GuardianRecord }) {
  const t = useTerminology()

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Person" subtitle="Held once, shared everywhere this person appears." />
        <Facts>
          {record.person.preferred_name && (
            <Fact label="Known as">{record.person.preferred_name}</Fact>
          )}
          <Fact label="Full name">{record.person.full_name}</Fact>
          <Fact label="Date of birth">
            {record.person.date_of_birth ? formatDate(record.person.date_of_birth) : <Blank />}
          </Fact>
          <Fact label="Gender">
            {record.person.gender ? humanize(record.person.gender) : <Blank />}
          </Fact>
          <Fact label="Nationality">{record.person.nationality_code || <Blank />}</Fact>
        </Facts>
      </Card>

      <Card>
        <CardHeader
          title="Contact"
          subtitle="Where the school writes. Neither field creates a sign-in."
        />
        <Facts>
          <Fact label="Email address">
            {record.person.email ? (
              <a
                href={`mailto:${record.person.email}`}
                className="text-accent-500 hover:underline"
              >
                {record.person.email}
              </a>
            ) : (
              <Blank />
            )}
          </Fact>
          <Fact label="Phone">
            {record.person.phone ? (
              <a href={`tel:${record.person.phone}`} className="text-accent-500 hover:underline">
                {record.person.phone}
              </a>
            ) : (
              <Blank />
            )}
          </Fact>
          {/*
           * A guardian record and a guardian LOGIN are different things. Most
           * guardians have the first and not the second, so the record says
           * which — otherwise a bursar wonders why the parent cannot see the
           * invoice they were told about.
           */}
          <Fact label="Portal access">
            <Flag on={record.person.has_login}>
              {record.person.has_login ? 'Can sign in' : 'No account'}
            </Flag>
          </Fact>
        </Facts>
      </Card>

      <Card>
        <CardHeader title={t('guardian')} subtitle="What this person does, and their standing." />
        <Facts>
          <Fact label="Occupation">{record.occupation || <Blank />}</Fact>
          <Fact label="Employer">{record.employer || <Blank />}</Fact>
          <Fact label="Status">
            <StatusBadge status={record.status} />
          </Fact>
          <Fact label={t('learners')}>
            <span className="tabular">{record.children_count}</span>
          </Fact>
        </Facts>
      </Card>
    </div>
  )
}

/* ── Children ────────────────────────────────────────────────────────────── */

/**
 * The children this guardian is tied to, and what each tie permits.
 *
 * The permissions live on the LINK, not the guardian: the same person can be
 * the legal guardian of one child and only an emergency contact for their
 * sibling. So the table is one row per tie and every flag is read from the row
 * rather than from the person above it.
 */
export function GuardianChildren({ guardianId }: { guardianId: string }) {
  const t = useTerminology()

  const children = useQuery({
    queryKey: guardianKeys.children(guardianId),
    queryFn: () => guardiansApi.children(guardianId),
  })

  if (children.isError) {
    return <ErrorState error={children.error} onRetry={() => children.refetch()} />
  }

  const rows = children.data ?? []

  const columns: Column<GuardianChildLink>[] = [
    {
      key: 'student',
      header: t('learner'),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={row.student.full_name} size="md" />
          <span className="truncate">{row.student.full_name}</span>
        </div>
      ),
    },
    {
      key: 'student_number',
      header: `${t('learner')} no.`,
      className: 'tabular',
      cell: (row) => row.student.student_number || <Blank />,
    },
    {
      key: 'relationship',
      header: 'Relationship',
      cell: (row) => (row.relationship_type ? humanize(row.relationship_type) : <Blank />),
    },
    {
      key: 'rights',
      header: 'Rights',
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Flag on={row.is_legal_guardian}>Legal</Flag>
          <Flag on={row.has_financial_responsibility}>Fees</Flag>
          <Flag on={row.can_pick_up}>Pick-up</Flag>
        </div>
      ),
    },
    {
      key: 'notifications',
      header: 'Notified about',
      cell: (row) => {
        const on = [
          row.receives_academic_notifications ? 'Academic' : null,
          row.receives_financial_notifications ? 'Financial' : null,
        ].filter(Boolean)
        return on.length > 0 ? on.join(', ') : <span className="text-gray-500">Nothing</span>
      },
    },
    {
      key: 'priority',
      header: 'Emergency',
      width: '7rem',
      className: 'tabular',
      /* 1 is called first. The number alone reads as a quantity, so it is
       * labelled where it is shown. */
      cell: (row) => (row.emergency_priority === null ? <Blank /> : `No. ${row.emergency_priority}`),
    },
    {
      key: 'status',
      header: 'Standing',
      width: '8rem',
      cell: (row) => <StatusBadge status={row.student.status} />,
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      loading={children.isLoading}
      skeletonRows={3}
      rowHref={(row) => `/students/${row.student_id}`}
      empty={
        <EmptyState
          icon={<Student size={20} />}
          title={`Not linked to any ${t('learners').toLowerCase()}`}
          description={`Ties are made from the ${t('learner').toLowerCase()}'s own record, under ${t('guardians')}.`}
        />
      }
    />
  )
}

/* ── Loading ─────────────────────────────────────────────────────────────── */

export function GuardianRecordSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {[0, 1, 2].map((card) => (
        <Card key={card}>
          <div className="border-b border-gray-200 px-4 py-3">
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="divide-y divide-gray-200">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

/** Kept beside the panels so the record header and the empty state agree on
 *  the icon a guardian is drawn with. */
export const GuardianIcon = UsersThree
