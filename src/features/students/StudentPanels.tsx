import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Receipt, UsersThree } from '@phosphor-icons/react'
import { formatDate, formatDateTime, formatMoney, humanize } from '@/shared/lib/format'
import { useTerminology } from '@/features/tenant/TenantProvider'
import {
  Avatar,
  Blank,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Skeleton,
  StatTile,
  StatusBadge,
  type Column,
} from '@/shared/ui'
import { studentKeys, studentsApi } from './students.api'
import type {
  GuardianLink,
  InvoiceRow,
  SessionEnrollmentRow,
  StudentBalance,
  StudentRecord,
} from './students.types'
import { useStudentPhoto } from './useStudentPhoto'

/**
 * The four panels behind the record's tabs.
 *
 * Each one owns its own request and is only asked for when its tab is open —
 * a record screen that fetches invoices, guardians and placement history to
 * show a name is four round trips for one answer.
 */

/* ── Small shared shapes ─────────────────────────────────────────────────── */

/* Promoted to `shared/ui` once the guardians record needed the same rows.
 * Re-exported so this module's existing importers do not have to care — and
 * imported too, because a re-export does not bind the names locally. */
export { Fact, Facts, Flag } from '@/shared/ui'
import { Fact, Facts, Flag } from '@/shared/ui'
import { StudentPhoto } from './StudentPhoto'

/* ── Overview ────────────────────────────────────────────────────────────── */

export function StudentOverview({ record }: { record: StudentRecord }) {
  const photo = useStudentPhoto(record.student_id, record.person.has_photo)
  /* Staff get the photograph as a CONTROL — upload and remove. The portal
   * caller below passes nothing and keeps the plain avatar, because
   * `/admin/students/{id}/photo` is a staff route in both directions. */
  return (
    <RecordOverview
      record={record}
      photo={photo}
      photoSlot={
        <StudentPhoto
          studentId={record.student_id}
          name={record.person.full_name}
          hasPhoto={record.person.has_photo}
        />
      }
    />
  )
}

/**
 * The record's three cards, with the photograph handed in.
 *
 * A learner and a guardian read the same facts and are shown the same panel,
 * but they may not fetch the photograph — `/admin/students/{id}/photo` is a
 * staff route like the rest of `/admin` — so the bytes arrive as a prop rather
 * than from a hook in here, and the portal caller passes null.
 */
export function RecordOverview({
  record,
  photo,
  photoSlot,
}: {
  record: StudentRecord
  photo: string | null
  /** Supplied by the staff screen so the photograph can be changed from here.
   *  Absent on the portal, which renders the picture and nothing more. */
  photoSlot?: ReactNode
}) {
  const t = useTerminology()

  const placed = record.session_enrollment !== null

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader title="Personal details" />
        {/* Left-aligned, like Sprig's own avatar panel. The name is not
            repeated under it: it is the page title six lines above, and the
            centred name-and-status block this replaced was a second, louder
            header for the record the reader is already standing on. */}
        <div className="px-4 py-4">
          {photoSlot ?? <Avatar name={record.person.full_name} src={photo} size="xl" />}
        </div>

        <div className="border-t border-gray-200">
          <Facts>
            {record.person.preferred_name && (
              <Fact label="Known as">{record.person.preferred_name}</Fact>
            )}
            <Fact label="Date of birth">
              {record.person.date_of_birth ? formatDate(record.person.date_of_birth) : <Blank />}
            </Fact>
            <Fact label="Gender">
              {record.person.gender ? humanize(record.person.gender) : <Blank />}
            </Fact>
          </Facts>
        </div>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader title="Record" />
        <Facts>
          <Fact label={`${t('learner')} number`}>
            <span className="tabular">{record.student_number}</span>
          </Fact>
          <Fact label="Admission number">
            {record.admission_number ? (
              <span className="tabular">{record.admission_number}</span>
            ) : (
              <Blank />
            )}
          </Fact>
          <Fact label="Admitted">
            {record.admission_date ? formatDate(record.admission_date) : <Blank />}
          </Fact>
          <Fact label="Graduated">
            {record.graduation_date ? formatDate(record.graduation_date) : <Blank />}
          </Fact>
          <Fact label="On roll">
            {/* The API's own answer, not `status === 'active'` inferred here —
                a transferred student can still be on a roll mid-handover. */}
            <Flag on={record.is_on_roll}>{record.is_on_roll ? 'On roll' : 'Off roll'}</Flag>
          </Fact>
        </Facts>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader title="Placement" subtitle={placed ? undefined : 'Not placed yet'} />
        {placed ? (
          <Facts>
            <Fact label={t('programme')}>{record.program?.name ?? <Blank />}</Fact>
            <Fact label={t('level')}>{record.level?.name ?? <Blank />}</Fact>
            {/* Plain ink, not a chip each. A class name is a value like the
                three above it, and outlining it made the one fact on the card
                that is already obvious look like the important one. */}
            <Fact label={t('group')}>
              {record.learning_groups.length > 0 ? (
                record.learning_groups.map((group) => group.name).join(', ')
              ) : (
                <Blank />
              )}
            </Fact>
            <Fact label="Enrolment status">
              <StatusBadge status={record.session_enrollment?.status ?? null} />
            </Fact>
            <Fact label="Started">
              {record.session_enrollment?.started_at ? (
                formatDate(record.session_enrollment.started_at)
              ) : (
                <Blank />
              )}
            </Fact>
          </Facts>
        ) : (
          <div className="px-4 py-8">
            <p className="text-center text-xs text-gray-600">
              This {t('learner').toLowerCase()} has been admitted but not yet placed in a{' '}
              {t('group').toLowerCase()}.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ── Academic: the placement history ─────────────────────────────────────── */

export function StudentAcademic({ studentId }: { studentId: string }) {
  const t = useTerminology()
  const query = useQuery({
    queryKey: studentKeys.enrollments(studentId),
    queryFn: () => studentsApi.enrollments(studentId),
  })

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }

  /* One line a row. The campus used to sit under the session as a second line;
   * it is a value with a question of its own, so it gets a column. */
  const columns: Column<SessionEnrollmentRow>[] = [
    { key: 'session', header: t('session'), cell: (row) => row.academic_session_name ?? <Blank /> },
    { key: 'campus', header: 'Campus', cell: (row) => row.campus_name ?? <Blank /> },
    { key: 'program', header: t('programme'), cell: (row) => row.program_name ?? <Blank /> },
    { key: 'level', header: t('level'), cell: (row) => row.academic_level_name ?? <Blank /> },
    { key: 'group', header: t('group'), cell: (row) => row.learning_group_name ?? <Blank /> },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'enrolled_at',
      header: 'Enrolled',
      /* Left-aligned with tabular figures: Sprig ranges its dates and counts
       * with the rest of the row and reserves the right edge for nothing. */
      className: 'tabular',
      width: '9rem',
      cell: (row) => (row.enrolled_at ? formatDate(row.enrolled_at) : <Blank />),
    },
  ]

  return (
    <Card>
      <CardHeader
        title={`${t('enrolment')} history`}
        subtitle={`One row for each ${t('session').toLowerCase()} this ${t('learner').toLowerCase()} has been placed in`}
      />
      <DataTable
        rows={query.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        skeletonRows={3}
        empty={
          <EmptyState
            icon={<UsersThree size={20} />}
            title="No placement recorded"
            description={`This ${t('learner').toLowerCase()} has not been enrolled in a ${t('session').toLowerCase()} yet.`}
          />
        }
      />
    </Card>
  )
}

/* ── Guardians ───────────────────────────────────────────────────────────── */

export function StudentGuardians({ studentId }: { studentId: string }) {
  const t = useTerminology()
  const query = useQuery({
    queryKey: studentKeys.guardians(studentId),
    queryFn: () => studentsApi.guardians(studentId),
  })

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }

  /* Single-line rows, one value a column: relationship, e-mail and telephone
   * each used to be a muted second line under the cell above it, which made
   * every guardian two rows tall for facts that sort and scan on their own. */
  const columns: Column<GuardianLink>[] = [
    {
      key: 'guardian',
      header: t('guardian'),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={row.guardian?.person.full_name} size="md" />
          <span className="truncate">{row.guardian?.person.full_name ?? 'Unnamed'}</span>
        </div>
      ),
    },
    {
      key: 'relationship',
      header: 'Relationship',
      width: '9rem',
      cell: (row) => (row.relationship_type ? humanize(row.relationship_type) : <Blank />),
    },
    {
      key: 'email',
      header: 'Email',
      cell: (row) => row.guardian?.person.email ?? <Blank />,
    },
    {
      key: 'phone',
      header: 'Phone',
      className: 'tabular',
      width: '9rem',
      cell: (row) => row.guardian?.person.phone ?? <Blank />,
    },
    {
      key: 'entitlements',
      header: 'Entitlements',
      cell: (row) => {
        const held = [
          row.is_legal_guardian && 'Legal',
          row.has_financial_responsibility && 'Financial',
          row.receives_academic_notifications && 'Academic notices',
          row.can_pick_up && 'Pick-up',
        ].filter((mark): mark is string => typeof mark === 'string')

        return held.length > 0 ? held.join(', ') : <Blank />
      },
    },
    {
      key: 'record_access',
      header: 'Record access',
      width: '9rem',
      /* `authorizes_record` is the API's own sum of legal guardianship,
         financial responsibility and academic notices. Read, never recomputed:
         pick-up rights are deliberately not part of it, and a client that adds
         them in tells a parent they may see a report they may not. */
      cell: (row) => (
        <Flag on={row.authorizes_record}>{row.authorizes_record ? 'Entitled' : 'Linked only'}</Flag>
      ),
    },
    {
      key: 'priority',
      header: 'Emergency',
      className: 'tabular',
      width: '7rem',
      cell: (row) => (row.emergency_priority === null ? <Blank /> : row.emergency_priority),
    },
  ]

  return (
    <Card>
      <CardHeader
        title={t('guardians')}
        subtitle="Who may be contacted, who may collect, and who is entitled to the record"
      />
      <DataTable
        rows={query.data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        skeletonRows={2}
        empty={
          <EmptyState
            icon={<UsersThree size={20} />}
            title={`No ${t('guardians').toLowerCase()} linked`}
            description={`Nobody is recorded as a ${t('guardian').toLowerCase()} for this ${t('learner').toLowerCase()}.`}
          />
        }
      />
    </Card>
  )
}

/* ── Finance ─────────────────────────────────────────────────────────────── */

export function StudentFinance({ studentId }: { studentId: string }) {
  const balance = useQuery({
    queryKey: studentKeys.balance(studentId),
    queryFn: () => studentsApi.balance(studentId),
  })

  const invoices = useQuery({
    queryKey: studentKeys.invoices(studentId),
    queryFn: () => studentsApi.invoices(studentId),
  })

  if (balance.isError) {
    return <ErrorState error={balance.error} onRetry={() => balance.refetch()} />
  }

  return (
    <RecordFinance
      balance={balance.data}
      balanceLoading={balance.isLoading}
      invoices={invoices.data?.rows ?? []}
      invoicesLoading={invoices.isLoading}
      invoicesError={invoices.error}
      onRetryInvoices={() => invoices.refetch()}
    />
  )
}

/**
 * Balance and invoices, as figures.
 *
 * The requests stay with the caller because the two readers ask different
 * endpoints for the same numbers — staff `/admin/finance/…`, a learner or
 * guardian `/portal/finance/…` — while the panel itself is the same answer to
 * the same question, so it takes what came back rather than fetching.
 */
export function RecordFinance({
  balance,
  balanceLoading,
  invoices,
  invoicesLoading,
  invoicesError,
  onRetryInvoices,
}: {
  balance: StudentBalance | undefined
  balanceLoading: boolean
  invoices: InvoiceRow[]
  invoicesLoading: boolean
  invoicesError: unknown
  onRetryInvoices: () => void
}) {
  const currency = balance?.currency ?? 'NGN'

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'invoice',
      header: 'Invoice',
      className: 'tabular',
      cell: (row) => row.invoice_number,
    },
    {
      key: 'origin',
      header: 'Raised by',
      width: '9rem',
      cell: (row) => (row.origin ? humanize(row.origin) : <Blank />),
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      cell: (row) => <StatusBadge status={row.voided_at ? 'cancelled' : row.status} />,
    },
    {
      key: 'issued',
      header: 'Issued',
      className: 'tabular',
      width: '11rem',
      cell: (row) => (row.issued_at ? formatDateTime(row.issued_at) : <Blank />),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      width: '8rem',
      cell: (row) => formatMoney(row.total_minor, row.currency),
    },
    {
      key: 'balance',
      header: 'Outstanding',
      numeric: true,
      width: '8rem',
      cell: (row) => formatMoney(row.balance_minor, row.currency),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Invoiced"
          loading={balanceLoading}
          value={formatMoney(balance?.invoiced_minor, currency)}
        />
        <StatTile
          label="Paid"
          loading={balanceLoading}
          value={formatMoney(balance?.paid_minor, currency)}
        />
        <StatTile
          label="Outstanding"
          loading={balanceLoading}
          value={formatMoney(balance?.balance_minor, currency)}
          hint={balance?.is_settled ? 'Settled' : undefined}
        />
        <StatTile
          label="Overdue"
          loading={balanceLoading}
          value={formatMoney(balance?.overdue_minor, currency)}
        />
      </div>

      <Card>
        <CardHeader title="Invoices" />
        {invoicesError ? (
          <div className="px-4">
            <ErrorState error={invoicesError} onRetry={onRetryInvoices} />
          </div>
        ) : (
          <DataTable
            rows={invoices}
            columns={columns}
            rowKey={(row) => row.id}
            loading={invoicesLoading}
            skeletonRows={3}
            empty={
              <EmptyState
                icon={<Receipt size={20} />}
                title="No invoices"
                description="Nothing has been billed against this record yet."
              />
            }
          />
        )}
      </Card>
    </div>
  )
}

/** The record's own loading shape — an avatar block and three cards, sized
 *  like the thing that is coming so the page does not jump. */
export function StudentRecordSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <Card key={index} className="p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </Card>
      ))}
    </div>
  )
}
