import { useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Image as ImageIcon } from '@phosphor-icons/react'
import { ApiError } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'
import type { Branding } from '@/shared/types/tenant.types'
import { Button, Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/shared/ui'
import { usePermissions, useTenant } from '@/features/tenant/TenantProvider'
import { FactList, FactRow, ReadOnlyNote } from '../components/Facts'
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, settingsApi } from '../settings.api'
import { settingsKeys } from '../settings.keys'
import type { Institution } from '../settings.types'

/**
 * What the institution looks like to the people it serves.
 *
 * The logo is the one thing here that can be changed, and it is deliberately
 * not behind the white-label permission: gating it there would leave every
 * school that did not buy white-labelling unable to put its own crest on its
 * own sign-in page. The colours ARE the white-label override, and the API
 * exposes no route that writes them, so they are shown and not offered.
 */
export function BrandingTab() {
  const { branding } = useTenant()
  const perms = usePermissions()
  const canView = perms.has('multi_tenancy.view')
  const canManage = perms.has('multi_tenancy.manage')

  const query = useQuery({
    queryKey: settingsKeys.institution,
    queryFn: settingsApi.institution,
    enabled: canView,
    staleTime: 5 * 60_000,
  })

  return (
    <div className="flex flex-col gap-5">
      {canView ? (
        query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LogoCard
            logoUrl={query.data?.logo_url ?? null}
            institutionName={branding.institution_name}
            canManage={canManage}
            loading={query.isLoading}
          />
        )
      ) : (
        <Card>
          <CardHeader title="Logo" />
          <CardBody className="py-2">
            <FactList>
              <FactRow label="Logo">
                {branding.logo_path ? 'Set' : 'Not set — initials are used instead'}
              </FactRow>
            </FactList>
            <ReadOnlyNote>
              The image itself is served with the institution record, which needs institution
              management access to read.
            </ReadOnlyNote>
          </CardBody>
        </Card>
      )}

      <ColoursCard branding={branding} />
    </div>
  )
}

/* ── The logo ──────────────────────────────────────────────────────────── */

const ACCEPT = LOGO_MIME_TYPES.join(',')

function localRefusal(file: File): string | null {
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a PNG, JPG or WebP. SVG is refused because it can carry script, and this image is shown before anyone signs in.'
  }
  if (file.size > LOGO_MAX_BYTES) {
    return 'That file is larger than 4 MB. A logo should be a few hundred kilobytes.'
  }
  return null
}

function LogoCard({
  logoUrl,
  institutionName,
  canManage,
  loading,
}: {
  logoUrl: string | null
  institutionName: string
  canManage: boolean
  loading: boolean
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  function applyInstitution(updated: Institution) {
    queryClient.setQueryData(settingsKeys.institution, updated)
    /* The sign-in screen reads the logo from the public context, not from the
     * admin record, so that cache has to hear about this too. */
    queryClient.invalidateQueries({ queryKey: qk.tenant.context })
  }

  const upload = useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: (updated) => {
      applyInstitution(updated)
      setRefusal(null)
      toast.success('Logo updated')
    },
    onError: (error) => {
      setRefusal(
        error instanceof ApiError
          ? (error.fieldErrors().logo ?? error.rootMessage())
          : 'The logo could not be uploaded.',
      )
    },
  })

  const remove = useMutation({
    mutationFn: () => settingsApi.deleteLogo(),
    onSuccess: (updated) => {
      applyInstitution(updated)
      setRefusal(null)
      toast.success('Logo removed')
    },
    onError: (error) => {
      setRefusal(error instanceof ApiError ? error.rootMessage() : 'The logo could not be removed.')
    },
  })

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const problem = localRefusal(file)
    if (problem) {
      setRefusal(problem)
      return
    }

    setRefusal(null)
    upload.mutate(file)
  }

  const busy = upload.isPending || remove.isPending

  return (
    <Card>
      <CardHeader title="Logo" subtitle="Shown on the sign-in page and on printed documents." />
      {/* Sprig's Logo and Avatar cards are the same block: the image itself at a
        * small fixed size, left-aligned, with a yellow upload and a white
        * Remove sitting directly under it. No centring, no big framed drop
        * zone, and no icon on either button. */}
      <CardBody className="flex flex-col items-start gap-3">
        {loading ? (
          <Skeleton className="h-16 w-16 rounded-md" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${institutionName} logo`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <ImageIcon size={20} className="text-gray-400" aria-label="No logo set" />
            )}
          </div>
        )}

        {canManage ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={onPick}
              className="hidden"
              aria-hidden
              tabIndex={-1}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                loading={upload.isPending}
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {logoUrl ? 'Upload New' : 'Upload a Logo'}
              </Button>
              {logoUrl && (
                <Button loading={remove.isPending} disabled={busy} onClick={() => remove.mutate()}>
                  Remove
                </Button>
              )}
            </div>
          </>
        ) : (
          <ReadOnlyNote>Changing the logo needs institution management access.</ReadOnlyNote>
        )}

        {refusal ? (
          <p role="alert" className="text-xs text-danger-500">
            {refusal}
          </p>
        ) : (
          canManage && (
            <p className="text-xs text-gray-500">
              PNG, JPG or WebP, at least 64 × 64, up to 4 MB. SVG is refused.
            </p>
          )
        )}
      </CardBody>
    </Card>
  )
}

/* ── The colours ───────────────────────────────────────────────────────── */

function ColoursCard({ branding }: { branding: Branding }) {
  return (
    <Card>
      <CardHeader title="Presence" subtitle="How the institution is named and coloured." />
      <CardBody className="py-2">
        <FactList>
          <FactRow label="Displayed name">{branding.institution_name}</FactRow>
          <FactRow label="Website">
            {branding.institution_url ? (
              <a
                href={branding.institution_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent-500 hover:underline"
              >
                {branding.institution_url}
              </a>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </FactRow>
          <FactRow label="Primary colour">
            <Swatch color={branding.primary_color} />
          </FactRow>
          <FactRow label="Secondary colour">
            <Swatch color={branding.secondary_color} />
          </FactRow>
        </FactList>
        <ReadOnlyNote>
          The colours are the white-label override the platform stores for this institution. No
          endpoint in the API writes them, so there is nothing here to change.
        </ReadOnlyNote>
      </CardBody>
    </Card>
  )
}

/**
 * The stored brand colour, shown as itself.
 *
 * The inline style is the one honest way to render this: the value is a hex the
 * institution owns, arriving over the network. It is data, not a design
 * decision, and there is no class that could carry it.
 */
function Swatch({ color }: { color: string | null }) {
  if (!color) return <span className="text-gray-500">Not set</span>

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="h-4 w-4 shrink-0 rounded border border-gray-300"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="font-mono text-xs uppercase">{color}</span>
    </span>
  )
}
