import type { ReactNode } from 'react'
import { CheckCircle, MinusCircle } from '@phosphor-icons/react'
import type { Account, Membership } from '@/shared/types/auth.types'
import type { InstitutionProfile, Tenant } from '@/shared/types/tenant.types'
import { Badge, Card, CardBody, CardHeader, StatusBadge } from '@/shared/ui'
import { formatDate, humanize } from '@/shared/lib/format'

/** A label on the left, the fact on the right. The one row shape both cards
 *  below are built from, so two lists of facts written for different reasons
 *  still line up. */
function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs font-medium text-gray-600">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-gray-900">{children}</dd>
    </div>
  )
}

/**
 * The two stamps the API records, said plainly.
 *
 * There is no endpoint anywhere in the API that starts an email or phone
 * verification — no `POST /auth/account/verify`, no resend — so this card
 * offers no button. An unverified address gets an honest "Not verified" rather
 * than a link into a flow that does not exist.
 */
export function VerificationCard({ account }: { account: Account }) {
  return (
    <Card>
      <CardHeader
        title="Verification"
        subtitle="Recorded by the platform. Nothing on this screen can start one."
      />
      <CardBody className="py-2">
        <dl className="divide-y divide-gray-200">
          <FactRow label="Email address">
            <VerificationStamp at={account.email_verified_at} />
          </FactRow>
          <FactRow label="Phone number">
            <VerificationStamp at={account.phone_verified_at} />
          </FactRow>
        </dl>
      </CardBody>
    </Card>
  )
}

function VerificationStamp({ at }: { at: string | null }) {
  if (at === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
        <MinusCircle size={14} className="text-gray-400" aria-hidden />
        Not verified
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-gray-900">
      <CheckCircle size={14} weight="fill" className="text-success-600" aria-hidden />
      Verified {formatDate(at)}
    </span>
  )
}

/**
 * Which institution this login belongs to, and as what.
 *
 * All of it comes from the context the app already holds — no request of its
 * own — because these are facts about the session rather than a record this
 * screen could edit. Changing somebody's access is `admin/users`, behind
 * permissions and an audit trail.
 */
export function MembershipCard({
  tenant,
  membership,
  institution,
  portal,
}: {
  tenant: Tenant
  membership: Membership | null
  institution: InstitutionProfile | null
  portal: string
}) {
  return (
    <Card>
      <CardHeader title="Institution" subtitle="Where this login belongs." />
      <CardBody className="py-2">
        <dl className="divide-y divide-gray-200">
          <FactRow label="Institution">{tenant.name}</FactRow>
          <FactRow label="Type">
            {institution
              ? `${institution.label}${institution.subtype_label ? ` · ${institution.subtype_label}` : ''}`
              : humanize(tenant.institution_type)}
          </FactRow>
          <FactRow label="Membership">
            {membership ? <StatusBadge status={membership.status} /> : <Badge>Unknown</Badge>}
          </FactRow>
          <FactRow label="Joined">{formatDate(membership?.joined_at)}</FactRow>
          <FactRow label="Signed in to">
            <Badge tone="accent">{humanize(portal)}</Badge>
          </FactRow>
        </dl>
      </CardBody>
    </Card>
  )
}
