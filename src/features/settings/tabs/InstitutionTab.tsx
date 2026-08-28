import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'
import { formatDate, humanize } from '@/shared/lib/format'
import type { InstitutionProfile, Tenant } from '@/shared/types/tenant.types'
import {
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { usePermissions, useTenant } from '@/features/tenant/TenantProvider'
import { FactList, FactRow, ReadOnlyNote } from '../components/Facts'
import { FormActions } from '../components/FormActions'
import { currencyOptions, timezoneOptions } from '../intlOptions'
import { settingsApi, type InstitutionUpdate } from '../settings.api'
import { settingsKeys } from '../settings.keys'
import type { Institution } from '../settings.types'

/**
 * The institution's own record.
 *
 * ── Two sources for one set of facts ──────────────────────────────────────
 *
 * `GET /admin/institution` is behind `multi_tenancy.view`, so a teacher asking
 * for it is answered 403. But every signed-in person already holds the same
 * values — `GET /portal/context` carries the tenant and its profile — so the
 * screen falls back to those rather than showing a permissions error for facts
 * the reader is entitled to. The request is never sent when it would be
 * refused; a 403 the client could have predicted is a 403 worth not making.
 */
export function InstitutionTab() {
  const { tenant, access } = useTenant()
  const perms = usePermissions()
  const canView = perms.has('multi_tenancy.view')
  const canManage = perms.has('multi_tenancy.manage')
  const profile = access?.institution ?? null

  const query = useQuery({
    queryKey: settingsKeys.institution,
    queryFn: settingsApi.institution,
    enabled: canView,
    staleTime: 5 * 60_000,
  })

  if (!canView) {
    return (
      <div className="flex flex-col gap-5">
        <ContextRecordCard tenant={tenant} profile={profile} />
        <AcademicModelCard profile={profile} />
      </div>
    )
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  if (query.isLoading || !query.data) {
    return <RecordSkeleton />
  }

  /* One column of stacked cards, which is what every Sprig Settings screen is.
   * Two cards side by side turn a settings page into a dashboard, and the
   * hairlines under two headings of different lengths stop lining up. */
  return (
    <div className="flex flex-col gap-5">
      <InstitutionForm institution={query.data} canManage={canManage} />
      <ClassificationCard institution={query.data} profile={profile} />
      <AcademicModelCard profile={profile} />
    </div>
  )
}

/* ── The editable record ───────────────────────────────────────────────── */

const FIELDS = [
  'name',
  'legal_name',
  'default_timezone',
  'default_locale',
  'default_currency',
  'country_code',
] as const
type FieldName = (typeof FIELDS)[number]

/** `UpdateInstitutionRequest`'s rules, transcribed. The currency is checked on
 *  shape rather than against a list because the list moves, and refusing a
 *  currency the world has started using is worse than accepting one nobody
 *  types. */
const schema = z.object({
  name: z.string().min(2, 'Use at least 2 characters').max(255, 'Use 255 characters or fewer'),
  legal_name: z.string().max(255, 'Use 255 characters or fewer'),
  default_timezone: z.string().min(1, 'Choose a timezone'),
  default_locale: z.string().min(1, 'Enter a language tag').max(20, 'Use 20 characters or fewer'),
  default_currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'A currency code is three letters, like NGN or USD'),
  country_code: z.union([
    z.literal(''),
    z.string().regex(/^[A-Za-z]{2}$/, 'A country code is two letters, like NG or GB'),
  ]),
})

type Values = z.infer<typeof schema>

function toValues(institution: Institution): Values {
  return {
    name: institution.name,
    legal_name: institution.legal_name ?? '',
    default_timezone: institution.default_timezone,
    default_locale: institution.default_locale,
    default_currency: institution.default_currency,
    country_code: institution.country_code ?? '',
  }
}

function InstitutionForm({
  institution,
  canManage,
}: {
  institution: Institution
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const defaults = useMemo(() => toValues(institution), [institution])

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults })
  const { reset } = form

  useEffect(() => {
    reset(defaults)
  }, [defaults, reset])

  const mutation = useMutation({
    mutationFn: (payload: InstitutionUpdate) => settingsApi.updateInstitution(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKeys.institution, updated)
      /* The timezone, locale and currency this record holds are what every
       * date and every amount in the product formats through, and both context
       * endpoints carry copies of them. */
      queryClient.invalidateQueries({ queryKey: qk.tenant.context })
      queryClient.invalidateQueries({ queryKey: qk.auth.context })
      reset(toValues(updated))
      toast.success('Institution settings saved')
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        toast.error('The settings could not be saved.')
        return
      }
      let attached = 0
      for (const [field, message] of Object.entries(error.fieldErrors())) {
        if ((FIELDS as readonly string[]).includes(field)) {
          form.setError(field as FieldName, { message })
          attached += 1
        }
      }
      if (attached === 0) toast.error(error.rootMessage())
    },
  })

  const errors = form.formState.errors
  const dirtyFields = form.formState.dirtyFields
  const isDirty = form.formState.isDirty

  function onSubmit(values: Values) {
    /* Every rule on the server is `sometimes`, so this sends only what moved —
     * two administrators with the form open at once would otherwise overwrite
     * each other's untouched fields. */
    const payload: InstitutionUpdate = {}
    for (const field of FIELDS) {
      if (!dirtyFields[field]) continue
      const value = values[field].trim()

      switch (field) {
        case 'name':
          payload.name = value
          break
        /* '' means "there is no separate registered name". The API normalises
         * it to null too, so that "cleared" and "never set" stay one state. */
        case 'legal_name':
          payload.legal_name = value === '' ? null : value
          break
        case 'default_timezone':
          payload.default_timezone = value
          break
        case 'default_locale':
          payload.default_locale = value
          break
        case 'default_currency':
          payload.default_currency = value.toUpperCase()
          break
        case 'country_code':
          payload.country_code = value === '' ? null : value.toUpperCase()
          break
      }
    }

    if (Object.keys(payload).length === 0) return
    mutation.mutate(payload)
  }

  const zones = timezoneOptions(institution.default_timezone)
  const currencies = currencyOptions(institution.default_currency)

  return (
    <Card>
      <CardHeader
        title="Institution profile"
        subtitle={
          canManage
            ? 'The name, the defaults every date and amount is formatted through.'
            : 'You can read these. Changing them needs institution management access.'
        }
      />

      <CardBody className="flex flex-col gap-1">
        {/* Sprig stacks its fields full width and pairs only the ones that are
          * genuinely a pair — its Change Password card puts the two password
          * boxes side by side and nothing else. The names get the full column;
          * the four short codes go two-up, which is the only place two of these
          * are ever read together. `gap-y-2` on the pairs is what keeps a hint
          * off the label beneath it. */}
        <form
          id="institution-profile"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-1"
        >
          <Field label="Institution name" error={errors.name?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('name')}
                disabled={!canManage}
                invalid={Boolean(errors.name)}
              />
            )}
          </Field>

          <Field
            label="Registered legal name"
            error={errors.legal_name?.message}
            hint="Only if it differs from the trading name."
          >
            {(props) => (
              <Input
                {...props}
                {...form.register('legal_name')}
                disabled={!canManage}
                invalid={Boolean(errors.legal_name)}
              />
            )}
          </Field>

          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Field
              label="Timezone"
              error={errors.default_timezone?.message}
              hint="Every date in the product is rendered in this zone."
            >
              {(props) => (
                <Select
                  {...props}
                  {...form.register('default_timezone')}
                  options={zones}
                  disabled={!canManage}
                  invalid={Boolean(errors.default_timezone)}
                />
              )}
            </Field>

            <Field
              label="Currency"
              error={errors.default_currency?.message}
              hint="Fees, invoices and payments are denominated in it."
            >
              {(props) => (
                <Select
                  {...props}
                  {...form.register('default_currency')}
                  options={currencies}
                  disabled={!canManage}
                  invalid={Boolean(errors.default_currency)}
                />
              )}
            </Field>

            <Field
              label="Default language"
              error={errors.default_locale?.message}
              hint="A language tag, like en or en-NG."
            >
              {(props) => (
                <Input
                  {...props}
                  {...form.register('default_locale')}
                  disabled={!canManage}
                  invalid={Boolean(errors.default_locale)}
                />
              )}
            </Field>

            <Field
              label="Country"
              error={errors.country_code?.message}
              hint="Two letters, like NG or GB."
            >
              {(props) => (
                <Input
                  {...props}
                  {...form.register('country_code')}
                  disabled={!canManage}
                  maxLength={2}
                  className="uppercase"
                  invalid={Boolean(errors.country_code)}
                />
              )}
            </Field>
          </div>
        </form>

        {canManage && (
          <FormActions
            formId="institution-profile"
            dirty={isDirty}
            saving={mutation.isPending}
            onDiscard={() => reset(defaults)}
          />
        )}
      </CardBody>
    </Card>
  )
}

/* ── The facts nothing on this screen can change ───────────────────────── */

function ClassificationCard({
  institution,
  profile,
}: {
  institution: Institution
  profile: InstitutionProfile | null
}) {
  return (
    <Card>
      <CardHeader title="Classification" />
      <CardBody className="py-2">
        <FactList>
          <FactRow label="Type">
            {profile?.label ?? humanize(institution.institution_type)}
          </FactRow>
          <FactRow label="Subtype">
            {profile?.subtype_label ?? humanize(institution.institution_subtype)}
          </FactRow>
          <FactRow label="Status">
            <StatusBadge status={institution.status} />
          </FactRow>
          <FactRow label="Address">{institution.platform_domain}</FactRow>
          <FactRow label="Identifier">
            <span className="font-mono text-xs">{institution.slug}</span>
          </FactRow>
          <FactRow label="On the platform since">{formatDate(institution.created_at)}</FactRow>
        </FactList>
        <ReadOnlyNote>
          The type and the identifier are set when the institution is created. Changing the type is
          a reclassification — it withdraws modules — and the platform performs it.
        </ReadOnlyNote>
      </CardBody>
    </Card>
  )
}

/** The API serves `attendance_modes` and `assessment_models` as option lists,
 *  but nothing writes them, so what is wanted here is the chosen one's label
 *  rather than the list. Falls back to the raw value: an unfamiliar mode is
 *  better shown than blanked. */
function labelFor(options: { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? humanize(value)
}

/**
 * How this institution runs, as its type decides.
 *
 * Every line is a fact, so every line is a key/value row. These were two
 * disabled `<select>`s above a fact list, which is a worse rendering twice
 * over: a disabled native select cannot be opened, so the option lists it
 * implied were never visible, and a control that will never be enabled invites
 * a reader to try. `attendance_mode` and `assessment_model` are derived from
 * the institution type rather than stored — no endpoint in the API writes
 * either — so they are facts, and they read like the ones beneath them.
 */
function AcademicModelCard({ profile }: { profile: InstitutionProfile | null }) {
  if (profile === null) {
    return (
      <Card>
        <CardHeader title="Academic model" />
        <CardBody>
          <p className="text-sm text-gray-600">
            The institution profile has not loaded for this session.
          </p>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Academic model" subtitle="Decided by the institution type." />
      <CardBody className="py-2">
        <FactList>
          <FactRow label="Attendance">
            {labelFor(profile.attendance_modes, profile.attendance_mode)}
          </FactRow>
          <FactRow label="Assessment">
            {labelFor(profile.assessment_models, profile.assessment_model)}
          </FactRow>
          <FactRow label="Progression">{profile.progression_model_label}</FactRow>
          <FactRow label="Division kind">{humanize(profile.period_label)}</FactRow>
          <FactRow label="Structure">
            {profile.academic_structure.map((level) => humanize(level)).join(' › ')}
          </FactRow>
        </FactList>

        <ReadOnlyNote>
          These follow from the institution type rather than being stored against it, so there is
          nothing here to save.
        </ReadOnlyNote>
      </CardBody>
    </Card>
  )
}

/** What a reader without `multi_tenancy.view` still holds: the same record,
 *  from the context every signed-in person is given. */
function ContextRecordCard({
  tenant,
  profile,
}: {
  tenant: Tenant
  profile: InstitutionProfile | null
}) {
  return (
    <Card>
      <CardHeader title="Institution profile" />
      <CardBody className="py-2">
        <FactList>
          <FactRow label="Name">{tenant.name}</FactRow>
          <FactRow label="Type">
            {profile?.label ?? humanize(tenant.institution_type)}
            {profile?.subtype_label ? ` · ${profile.subtype_label}` : ''}
          </FactRow>
          <FactRow label="Status">
            <StatusBadge status={tenant.status} />
          </FactRow>
          <FactRow label="Timezone">{tenant.default_timezone}</FactRow>
          <FactRow label="Currency">{tenant.default_currency}</FactRow>
          <FactRow label="Default language">{tenant.default_locale}</FactRow>
          <FactRow label="Address">{tenant.platform_domain}</FactRow>
        </FactList>
        <ReadOnlyNote>
          Editing the institution record needs institution management access. Ask whoever
          administers your institution.
        </ReadOnlyNote>
      </CardBody>
    </Card>
  )
}

function RecordSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardBody className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
          <Skeleton className="h-8 w-28" />
        </CardBody>
      </Card>
      {Array.from({ length: 2 }).map((_, card) => (
        <Card key={card}>
          <CardBody className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((__, row) => (
              <Skeleton key={row} className="h-4 w-full" />
            ))}
          </CardBody>
        </Card>
      ))}
    </div>
  )
}
