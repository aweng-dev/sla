import { SignOut } from '@phosphor-icons/react'
import { useTenant } from '@/features/tenant/TenantProvider'
import { useSignOut } from '@/features/auth/useSignOut'
import { PageStack } from '@/shared/layout/AppShell'
import { Button, Card, CardBody, PageHeader, Skeleton } from '@/shared/ui'
import { AvatarCard } from './components/AvatarCard'
import { MembershipCard, VerificationCard } from './components/AccountFacts'
import { ProfileForm } from './components/ProfileForm'

/**
 * The signed-in person's own record.
 *
 * Everything on this screen is about the caller and nothing else — the API's
 * account routes carry no id at all — so there is no permission check anywhere
 * on it. Correcting a colleague's details is `admin/users`, a different screen
 * behind different permissions and an audit trail.
 *
 * One column of cards, in Sprig's order: the photo first, then the details,
 * then what can only be read. Each card is still its own surface, so the split
 * that mattered survives — a verification stamp is never inside the same card
 * as an editable field, which is how people come to believe they can change it.
 * The earlier two-column split put the avatar in a 320px rail, which is not a
 * shape Sprig's Settings ever takes.
 */
export function AccountPage() {
  const { tenant, account, membership, access, portal, isLoading } = useTenant()
  const signOut = useSignOut()

  return (
    /* Same measured column as Settings — a name is not a 1100px field. */
    <PageStack className="max-w-[60rem]">
      {/* Title and action, nothing else. The sentence that stood here listed
          the three cards immediately below it, each of which already heads
          itself — and it was written here rather than supplied by the API, so
          there was nothing in it to keep. */}
      <PageHeader
        title="Your account"
        actions={
          <Button icon={<SignOut size={15} />} onClick={() => void signOut()}>
            Sign out
          </Button>
        }
      />

      {account === null ? (
        <AccountSkeleton loading={isLoading} />
      ) : (
        <div className="flex flex-col gap-5">
          <AvatarCard account={account} />
          <ProfileForm account={account} institutionTimezone={tenant.default_timezone} />
          <VerificationCard account={account} />
          <MembershipCard
            tenant={tenant}
            membership={membership}
            institution={access?.institution ?? null}
            portal={portal}
          />
        </div>
      )}
    </PageStack>
  )
}

/**
 * Sized like the thing that is coming, so nothing moves when it lands.
 *
 * `loading` is false only in the case the router should have prevented — a
 * mounted screen with no session — and saying so beats an animation that never
 * resolves.
 */
function AccountSkeleton({ loading }: { loading: boolean }) {
  if (!loading) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-gray-600">
            This session has no account attached. Sign in again to continue.
          </p>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardBody className="flex flex-col items-start gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-8 w-52" />
        </CardBody>
      </Card>
      <Card>
        <CardBody className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
          <Skeleton className="h-8 w-28" />
        </CardBody>
      </Card>
    </div>
  )
}
