import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeSlash, Info, WarningCircle } from '@phosphor-icons/react'
import { Button, Field, Input, Spinner } from '@/shared/ui'
import { cn } from '@/shared/lib/cn'
import { ApiError } from '@/shared/api/envelope'
import { useTenant, useTerminology } from '@/features/tenant/TenantProvider'
import { authApi } from './auth.api'
import { useSessionStore } from './session.store'

/**
 * The one front door.
 *
 * ── The composition is Sprig's own sign-in, measured ───────────────────────
 *
 * Sampled from Sprig's login capture rather than remembered: an exact 50/50
 * split with a #efefef-class hairline down the middle, the mark pinned at the
 * page's top-left corner (28px in from both edges) rather than stacked above
 * the form, a ~400px form column centred in the white half, grey regular field
 * labels, and one saturated element — the yellow button. The alert sits ABOVE
 * the heading, where Sprig puts it, so a failed attempt is the first thing read
 * and the fields do not move down the page when it appears.
 *
 * Sprig's own login runs looser than its product — ~40px inputs, a display-size
 * heading — because it is a marketing-adjacent page. This one deliberately does
 * not: 20px semibold title, 13px body, 32px controls, exactly as every signed-in
 * screen. Somebody who signs in should not watch the type shrink underneath them.
 *
 * ── One form for four kinds of person ──────────────────────────────────────
 *
 * Staff, teachers, students and guardians all arrive here, and the identifier
 * field is deliberately not an email input: `POST /auth/login` accepts an email
 * address OR a student, admission or staff number, because a family is handed a
 * card with a number on it and frequently has no address on file. Typing the
 * field as `email` would lock those users out of their own records.
 *
 * ── A bad password is not an expired session ───────────────────────────────
 *
 * Both are 401s. The API separates them by code — `INVALID_CREDENTIALS` here,
 * `AUTHENTICATION_REQUIRED` for a dead token — and only the second one is wired
 * to the store's expiry path. So a wrong password lands on the identifier input
 * (the API even names the field) and this screen does not move: bouncing a user
 * from sign-in to sign-in reads as "nothing happened when I pressed the button".
 *
 * ── There is no sign-up, and no reset link ─────────────────────────────────
 *
 * Institutions are created from a separate platform console, and the API serves
 * no registration or password-reset route (both probed: 404). A link to either
 * would be a link to nothing, so the footer says who to ask instead.
 */

const schema = z.object({
  login: z.string().min(1, 'Enter your email address or ID number'),
  password: z.string().min(1, 'Enter your password'),
})

type LoginValues = z.infer<typeof schema>

export function LoginPage() {
  const { tenant, branding } = useTenant()
  const t = useTerminology()
  const navigate = useNavigate()
  const search = useSearch({ from: '/login' })

  const status = useSessionStore((s) => s.status)
  const signIn = useSessionStore((s) => s.signIn)
  const expiredMessage = useSessionStore((s) => s.expiredMessage)
  const clearExpiredMessage = useSessionStore((s) => s.clearExpiredMessage)

  const [notice, setNotice] = useState<string | null>(null)
  const [formAlert, setFormAlert] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)

  const destination = safeRedirect(search.redirect) ?? '/dashboard'

  /* The store holds the expiry message until somebody shows it. Copy it out
   * and clear it, so returning to this screen an hour later does not announce
   * a session that ended long ago. */
  useEffect(() => {
    if (!expiredMessage) return
    setNotice(expiredMessage)
    clearExpiredMessage()
  }, [expiredMessage, clearExpiredMessage])

  /* One redirect for two cases: the person who just signed in, and the one who
   * already had a session and typed /login anyway. Both are "authenticated on
   * this screen", and neither should be looking at a form. */
  useEffect(() => {
    if (status !== 'authenticated') return
    void navigate({ to: destination, replace: true })
  }, [status, destination, navigate])

  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { login: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormAlert(null)
    setNotice(null)

    try {
      const session = await authApi.login({
        login: values.login.trim(),
        password: values.password,
      })
      signIn(session)
      /* No navigation here: the effect above owns it, so there is exactly one
       * place that decides where a signed-in person lands. */
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormAlert('Something went wrong signing you in. Please try again.')
        return
      }

      /* `errors[].field` is the input's own name. Anything that names a field
       * this form does not draw — or names none at all — belongs above the
       * fields rather than nowhere. */
      let attached = 0
      for (const [field, message] of Object.entries(error.fieldErrors())) {
        if (field !== 'login' && field !== 'password') continue
        form.setError(field, { message }, { shouldFocus: attached === 0 })
        attached += 1
      }
      if (attached === 0) setFormAlert(error.rootMessage())
    }
  })

  /* A token in storage is a claim, not a session — `unknown` means /auth/me has
   * not answered yet. Showing the form during that flashes a sign-in screen at
   * somebody who is already signed in. */
  if (status !== 'anonymous') {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center bg-white">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const institution = branding.institution_name || tenant.name
  const errors = form.formState.errors

  return (
    <div className="flex min-h-dvh w-full bg-white">
      <main className="relative flex min-w-0 flex-1 flex-col justify-center px-6 py-24 sm:px-10">
        <div className="mx-auto w-full max-w-[25rem]">
          {/* From `lg` this pins to the page corner, 28px in from both edges,
            * where Sprig pins its wordmark. Below `lg` it stays in the flow
            * above the heading: pinning it to the top of a phone screen leaves
            * a hand's width of nothing between the school's name and the form
            * it belongs to. The API hands out no logo URL (`branding.logo_path`
            * is a storage key behind an endpoint this screen is not
            * authenticated for), so the institution is named in words beside
            * the product's own mark. */}
          <div className="mb-8 flex items-center gap-2.5 lg:absolute lg:left-7 lg:top-7 lg:mb-0 lg:max-w-[calc(100%-3.5rem)]">
            <BrandMark />
            <span className="truncate text-sm font-extrabold tracking-[-0.02em] text-gray-900">
              {institution}
            </span>
          </div>

          {notice && (
            <div
              role="status"
              className="mb-4 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <Info size={14} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
              <p className="text-xs leading-[1.125rem] text-gray-700">{notice}</p>
            </div>
          )}

          {formAlert && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2"
            >
              <WarningCircle size={14} className="mt-0.5 shrink-0 text-danger-500" aria-hidden />
              <p className="text-xs leading-[1.125rem] text-danger-700">{formAlert}</p>
            </div>
          )}

          <h1 className="text-title">Sign in</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Staff, {t('learners').toLowerCase()} and {t('guardians').toLowerCase()} all sign in
            here.
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-5 flex flex-col gap-2">
            <Field
              label="Email address or ID number"
              hint={`Your email address, or your ${t('learner').toLowerCase()}, admission or staff number.`}
              error={errors.login?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  {...form.register('login')}
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  invalid={Boolean(errors.login)}
                />
              )}
            </Field>

            <Field label="Password" error={errors.password?.message}>
              {(props) => (
                <Input
                  {...props}
                  {...form.register('password')}
                  type={revealed ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  invalid={Boolean(errors.password)}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setRevealed((value) => !value)}
                      aria-label={revealed ? 'Hide password' : 'Show password'}
                      aria-pressed={revealed}
                      className="flex items-center rounded text-gray-500 transition-colors hover:text-gray-900"
                    >
                      {revealed ? <EyeSlash size={15} /> : <Eye size={15} />}
                    </button>
                  }
                />
              )}
            </Field>

            {/* `Field` reserves 18px under every control so validation does not
              * shift the form. Pulling the button back up spends that reserve
              * once, instead of leaving a hole above the only thing to press. */}
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={form.formState.isSubmitting}
              className="-mt-3"
            >
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-xs leading-[1.125rem] text-gray-500">
            Institutions are provisioned by the platform administrator — there is no public sign-up.
            If you have forgotten your password or cannot get in, your institution&rsquo;s
            administrator can reset it for you.
          </p>
        </div>
      </main>

      <BrandPanel />
    </div>
  )
}

/**
 * The cream half.
 *
 * Sprig's sign-in puts one thing on this panel and nothing else — no headline,
 * no marketing paragraph, no texture behind it. This follows that: a single
 * quiet miniature of the product's own surfaces — the rail, the toolbar, the
 * #faf8f4 table band and single-line rows — drawn in hairlines and greys, on
 * flat cream. The yellow appears once, at 16px, and nothing else is saturated.
 *
 * Hidden below `lg`, where 375px has no room for anything but the form.
 */
function BrandPanel() {
  return (
    <aside
      aria-hidden
      className="hidden shrink-0 items-center justify-center border-l border-gray-300 bg-cream px-10 lg:flex lg:w-1/2"
    >
      <div className="w-full max-w-[26rem] overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-gray-200 bg-table-head px-3 py-2.5">
          <span className="h-4 w-4 shrink-0 rounded-[0.25rem] bg-brand-400" />
          <span className="h-1.5 w-20 rounded-full bg-gray-300" />
          <span className="ml-auto h-1.5 w-8 rounded-full bg-gray-200" />
        </div>

        <div className="flex">
          <div className="w-[4.5rem] shrink-0 border-r border-gray-200 bg-rail px-1.5 py-2">
            {RAIL.map((width, index) => (
              <span
                key={index}
                className={cn(
                  'mb-1 flex h-6 items-center rounded px-1.5',
                  index === 1 && 'bg-rail-active',
                )}
              >
                {/* Every item is the same weight; the darker ground is the only
                  * thing marking the current page, exactly as the real rail. */}
                <span className={cn('block h-1.5 rounded-full bg-gray-300', width)} />
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
              <span className="h-5 w-11 rounded border border-gray-300" />
              <span className="h-5 w-14 rounded border border-gray-300" />
              <span className="ml-auto h-5 w-16 rounded border border-gray-300" />
            </div>

            <div className="flex items-center gap-2.5 border-b border-gray-200 bg-table-head px-3 py-2">
              <span className="h-1 w-12 rounded-full bg-gray-300" />
              <span className="h-1 w-8 rounded-full bg-gray-300" />
              <span className="ml-auto h-1 w-8 rounded-full bg-gray-300" />
            </div>

            {/* Single-line rows. The product's tables are one line of 13px in a
              * 34px row, and a miniature that stacked two bars per row would be
              * advertising a table this app does not draw. */}
            <div className="divide-y divide-gray-200">
              {ROWS.map((width, index) => (
                <div key={index} className="flex h-[1.875rem] items-center gap-2.5 px-3">
                  <span className="h-4 w-4 shrink-0 rounded-full bg-gray-100" />
                  <span className={cn('block h-1.5 rounded-full bg-gray-300', width)} />
                  <span className="ml-auto h-1.5 w-8 shrink-0 rounded-full bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

const RAIL = ['w-7', 'w-9', 'w-6', 'w-8', 'w-7', 'w-9'] as const
const ROWS = ['w-24', 'w-20', 'w-28', 'w-[5.5rem]', 'w-24'] as const

/** The app's mark, as drawn in the rail. Copied rather than imported, because
 *  the rail is layout for signed-in screens and this page is not one of them. */
function BrandMark() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-400">
      <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
        <path d="M16 7 5.5 12.2 16 17.4l10.5-5.2L16 7Z" className="fill-gray-900" />
        <path
          d="M9.2 15.6v5.1c0 1.9 3 3.4 6.8 3.4s6.8-1.5 6.8-3.4v-5.1L16 19l-6.8-3.4Z"
          className="fill-gray-900 opacity-[0.55]"
        />
      </svg>
    </span>
  )
}

/**
 * Where `?redirect=` may send somebody.
 *
 * Only a path within this app. A value that starts `//` or names a scheme is a
 * different origin wearing a relative path's clothes, and following it would
 * turn the sign-in screen into an open redirect — the classic way a phishing
 * link borrows a trusted domain.
 */
function safeRedirect(value: string | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.startsWith('/login')) return null
  return value
}
