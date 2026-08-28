# SchoolLink — institution dashboard (`sla`)

The tenant-facing web app for the SchoolLink API (`../slb`). One build serves
every institution and all four of its front doors — administration, teaching,
student and parent — because the API decides which one a person gets.

```
slb/   Laravel API          http://localhost:8000/rest/v1
sla/   this app             http://localhost:5174
slp/   platform console     (separate app; platform admins only)
```

## Running it

```bash
pnpm install
cp .env.example .env      # VITE_TENANT_DOMAIN must name a real institution
pnpm dev
```

Sign in with any of the seeded accounts (password `SchoolLink!2026`):

| Portal | Identifier |
|---|---|
| Institution owner | `owner@greenfield.schoollink.test` |
| Teacher | `teacher@greenfield.schoollink.test` |
| Student | `student@greenfield.schoollink.test` |
| Guardian | `guardian@greenfield.schoollink.test` |

Each lands in a different portal with a different sidebar — that is the API's
decision, not a client-side branch on a role name.

## The three things worth knowing before you edit anything

### 1. The tenant is a HEADER, not a claim in the token

The API resolves the institution from the host: `X-Tenant-Domain`, falling back
to the request's own hostname. In production one build is served on every
tenant hostname (`*.schoollink.ng`) while the API answers on a single
`api.schoollink.ng`, so the API only ever sees its own host — which belongs to
no institution. **Without that header every call fails tenant resolution, sign-in
included.** `resolveTenantDomain()` in `src/shared/api/client.ts` sends
`window.location.hostname`, and `VITE_TENANT_DOMAIN` overrides it on localhost
where the browser's hostname likewise belongs to nobody.

There is no tenant switcher, because no user belongs to two institutions.
`src/features/tenant/TenantProvider.tsx` is where a selector would grow.

### 2. The sidebar is server-driven

Nothing in `src/shared/layout/Sidebar.tsx` is a hard-coded list.
`GET /portal/context` resolves which of the ~60 modules a person holds in this
institution, groups them into sections and returns the tree. An institution
that switches off Transport loses the Transport item with no deploy.

Rendering an item is not granting it. Every route behind every item re-runs its
own check server-side; `usePermissions()` decides what to **draw**, never what
is allowed.

Six modules have bespoke screens. The rest route through `/$module` to
`features/modules/ModulePage`, which resolves the real module from the
navigation tree and says plainly that the screen is not built.

### 3. The palette is pixel-sampled from Sprig, and it is remapped, not added

`palette.js` is the single source of truth. `tokens.css` mirrors the same hexes
for the CSS custom properties — CSS cannot import JS, so **both must change
together**. `tailwind.config.js` remaps *every* stock Tailwind ramp onto it, so
`bg-indigo-600` lands on Sprig purple and a developer reaching for a familiar
name still gets the right paint. Leaving a ramp unmapped is how a single
element silently ships in stock Tailwind blue.

Two rules that are defects rather than preferences:

- **Yellow is a fill, never text.** `#f8d030` on white is 1.49:1. The label on a
  yellow fill is `text-gray-900`. `scripts/check-contrast.mjs` asserts this pair
  *fails*, so anybody who "fixes" it trips the check.
- **Never write a hex in a component.** Values that cannot be a class — Recharts
  props, gradient strings, category maps — come from
  `src/shared/theme/chartColors.ts`.

```bash
pnpm build && pnpm lint:palette   # asserts the built CSS is entirely on-palette
node scripts/check-contrast.mjs   # asserts the 23 pairings the app renders
```

## Shapes that surprise people

- **Field errors are in `errors[]`, not `message`.** Each entry carries `field`,
  which is the input's own name — `ApiError.fieldErrors()` hands them straight
  to react-hook-form.
- **Paginated lists are flattened.** Rows arrive as `data` (a bare array) and
  the counters move to `meta.pagination`. This is *not* Laravel's default
  `data.data` / `data.last_page`; use `getPage()`.
- **Money is in minor units.** `charged_minor`, `balance_minor`. Never divide by
  100 — `formatMoney()` knows that not every currency has two decimal places.
- **`per_page` is clamped server-side** (default 25, max 100). Asking for 1000
  silently returns 100, which reads as a short roll rather than an error.
- **Avatars and photographs are bytes, never URLs.** `has_avatar` / `has_photo`
  are flags saying whether it is worth spending a request.

## Vocabulary

Every domain noun goes through `useTerminology()`. A school's *Class* is a
university's *Cohort*; a school's *Subject* is a university's *Module*.

Product-wide the academic year is a **Session** and its divisions are
**Periods** — in all three institution vocabularies. Never write "Term" or
"Academic year" as a concept name; "term" is only ever an institution's own
*kind* label for a period.

## Layout

```
palette.js            ramps — the single source of truth
tokens.css            the same hexes as CSS custom properties
tailwind.config.js    remaps every stock ramp onto the palette
scripts/              palette and contrast assertions
src/
  app/                providers, router, QueryClient
  shared/
    api/              axios client, envelope + ApiError, query keys
    ui/               the Sprig primitives — use these, do not re-implement
    layout/           AppShell, Sidebar, Topbar
    icons/            module id → Phosphor icon
    theme/            colour VALUES for charts and category maps
    lib/              cn, formatters
    store/            chrome state (zustand)
    types/            API payload types, transcribed from live responses
  features/
    auth/             sign-in, session store, the 401 path
    tenant/           TenantProvider — institution, account, access, cache purge
    dashboard/        four portals, four dashboards
    students/         the reference list + detail implementation
    account/ settings/ notifications/ search/ help/
    modules/          the scaffold every un-built module routes to
```
