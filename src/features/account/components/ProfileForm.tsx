import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/shared/api/envelope'
import { qk } from '@/shared/api/queryKeys'
import type { Account, MeResponse } from '@/shared/types/auth.types'
import { Button, Card, CardBody, CardFooter, CardHeader, Field, Input, Select } from '@/shared/ui'
import { timezoneOptions } from '@/features/settings/intlOptions'
import { accountApi, type AccountUpdate } from '../account.api'

/**
 * Name, address, number, language and timezone — the five columns
 * `UpdateOwnAccountRequest` will accept.
 *
 * The regex and the lengths are the server's own, transcribed rather than
 * invented, so a value this form accepts is one the API accepts. It is a
 * deliberately loose phone rule: this product runs in places where people
 * write 0803 123 4567 and expect it back the way they typed it.
 */
const FIELDS = ['name', 'email', 'phone', 'preferred_locale', 'timezone'] as const
type FieldName = (typeof FIELDS)[number]

const schema = z.object({
  name: z.string().min(1, 'Enter your name').max(255, 'Use 255 characters or fewer'),
  email: z.union([
    z.literal(''),
    z.email('Enter a valid email address').max(255, 'Use 255 characters or fewer'),
  ]),
  phone: z.union([
    z.literal(''),
    z
      .string()
      .max(50, 'Use 50 characters or fewer')
      .regex(/^[0-9 ()+\-.]{6,50}$/, 'Use digits, spaces and + ( ) - only'),
  ]),
  preferred_locale: z.string().max(20, 'Use 20 characters or fewer'),
  timezone: z.string(),
})

type Values = z.infer<typeof schema>

function toValues(account: Account): Values {
  return {
    name: account.name,
    email: account.email ?? '',
    phone: account.phone ?? '',
    preferred_locale: account.preferred_locale ?? '',
    timezone: account.timezone ?? '',
  }
}

export function ProfileForm({
  account,
  institutionTimezone,
}: {
  account: Account
  /** Shown as the fallback on the timezone field: leaving it blank is not
   *  "no timezone", it is "whatever the institution uses". */
  institutionTimezone: string
}) {
  const queryClient = useQueryClient()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(account),
  })

  const { reset } = form

  /*
   * Re-seeded on the RECORD, not on the object holding it.
   *
   * `/auth/me` is rewritten whole whenever any part of the account changes —
   * an avatar upload and a removal both write a brand-new `Account` into the
   * cache, and every refetch produces another one — so the object identity
   * changes constantly while the person does not. Re-seeding on that identity
   * discarded whatever had been typed and not yet saved.
   *
   * What genuinely needs a re-seed is a different person's record arriving in
   * a mounted form. A successful save of THIS form re-seeds itself from its
   * own response below, which is the case reset exists for.
   */
  const seededId = useRef(account.id)
  useEffect(() => {
    if (seededId.current === account.id) return
    seededId.current = account.id
    reset(toValues(account))
  }, [account, reset])

  const mutation = useMutation({
    mutationFn: (payload: AccountUpdate) => accountApi.update(payload),
    onSuccess: (updated) => {
      /* Written into the cache before the invalidation so the header, the rail
       * and this form do not blink through the previous name on the way to the
       * refetch. */
      queryClient.setQueryData<MeResponse>(qk.auth.me, (previous) =>
        previous ? { ...previous, user: updated } : previous,
      )
      queryClient.invalidateQueries({ queryKey: qk.auth.me })
      reset(toValues(updated))
      toast.success('Your details were saved')
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        toast.error('Your details could not be saved.')
        return
      }

      const fieldErrors = error.fieldErrors()
      let attached = 0
      for (const [field, message] of Object.entries(fieldErrors)) {
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
    /*
     * Only what changed. Every rule on the server is `sometimes`, so this is a
     * genuine partial update — and sending the whole record back would mean a
     * value this tab loaded an hour ago overwriting one saved from a phone in
     * the meantime.
     *
     * '' is sent as null: the columns are unique with NULLS NOT DISTINCT, so
     * two blanks collide where two nulls do not. The API normalises it too;
     * doing it here means the request says what it means.
     */
    const payload: AccountUpdate = {}
    for (const field of FIELDS) {
      if (!dirtyFields[field]) continue
      const value = values[field].trim()
      if (field === 'name') payload.name = value
      else payload[field] = value === '' ? null : value
    }

    if (Object.keys(payload).length === 0) return
    mutation.mutate(payload)
  }

  /* An empty first option, not `placeholder` — `Select` renders that one
   * disabled, and "no timezone of my own" has to stay choosable. */
  const zones = [
    { value: '', label: 'Follow the institution' },
    ...timezoneOptions(account.timezone),
  ]

  return (
    <Card>
      <CardHeader
        title="Your details"
        subtitle="How the product addresses you, and where it reaches you."
      />

      <CardBody>
        <form id="account-profile" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          {/* `gap-y-2` is what keeps a field's hint off the label of the field
              beneath it — with no row gap, "Used to sign in and to reach you."
              sat directly against "Preferred language" and read as one block.
              Same measure the institution form uses. */}
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Field label="Full name" required error={errors.name?.message} className="sm:col-span-2">
              {(props) => (
                <Input
                  {...props}
                  {...form.register('name')}
                  autoComplete="name"
                  invalid={Boolean(errors.name)}
                />
              )}
            </Field>

            <Field
              label="Email address"
              error={errors.email?.message}
              hint="Used to sign in and to reach you."
            >
              {(props) => (
                <Input
                  {...props}
                  {...form.register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  invalid={Boolean(errors.email)}
                />
              )}
            </Field>

            <Field label="Phone number" error={errors.phone?.message} hint="Digits, spaces and + ( ) -">
              {(props) => (
                <Input
                  {...props}
                  {...form.register('phone')}
                  type="tel"
                  autoComplete="tel"
                  placeholder="0803 123 4567"
                  invalid={Boolean(errors.phone)}
                />
              )}
            </Field>

            <Field
              label="Preferred language"
              error={errors.preferred_locale?.message}
              hint="A language tag, like en or en-NG."
            >
              {(props) => (
                <Input
                  {...props}
                  {...form.register('preferred_locale')}
                  autoComplete="language"
                  placeholder="en"
                  invalid={Boolean(errors.preferred_locale)}
                />
              )}
            </Field>

            <Field
              label="Timezone"
              error={errors.timezone?.message}
              hint={`Leave unset to follow ${institutionTimezone}.`}
            >
              {(props) => (
                <Select
                  {...props}
                  {...form.register('timezone')}
                  options={zones}
                  invalid={Boolean(errors.timezone)}
                />
              )}
            </Field>
          </div>
        </form>
      </CardBody>

      <CardFooter>
        <Button
          variant="ghost"
          onClick={() => reset(toValues(account))}
          disabled={!isDirty || mutation.isPending}
        >
          Discard
        </Button>
        <Button
          type="submit"
          form="account-profile"
          variant="primary"
          loading={mutation.isPending}
          disabled={!isDirty}
        >
          Save changes
        </Button>
      </CardFooter>
    </Card>
  )
}
