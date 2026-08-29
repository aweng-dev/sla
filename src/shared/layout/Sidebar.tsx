import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import {
  Bell,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  Plus,
  Question,
  Gear,
  SignOut,
  UserCircle,
} from '@phosphor-icons/react'
import { cn } from '@/shared/lib/cn'
import { ModuleIcon } from '@/shared/icons/moduleIcons'
import { useNavLabels, type NavLabels } from '@/shared/nav/moduleLabels'
import { useTenant } from '@/features/tenant/TenantProvider'
import { useUiStore } from '@/shared/store/ui.store'
import { useSignOut } from '@/features/auth/useSignOut'
import { Avatar, Badge, Menu, Tooltip, type MenuItemSpec } from '@/shared/ui'
import type { NavigationItem } from '@/shared/types/navigation.types'
import { SETTINGS_OWNED_MODULES } from '@/features/settings/sections'

/**
 * The rail.
 *
 * ── It is server-driven, and that is the point ─────────────────────────────
 *
 * Nothing here is a hard-coded list. `GET /portal/context` resolves which
 * modules this person holds in this institution, groups them into sections and
 * returns the tree; this file arranges it. So an institution that switches off
 * Transport loses the Transport item with no deploy, and an administrator, a
 * teacher, a student and a guardian get four different rails from one build.
 *
 * Rendering an item is not granting it. Every route behind every item re-runs
 * its own check server-side.
 *
 * ── Sprig's proportions ────────────────────────────────────────────────────
 *
 * #f9f9f9 ground against the white canvas, a hairline between them, 13px
 * labels, and a #eeeeee rounded fill on the active row — no left border, no
 * accent bar, no colour. The one saturated thing in the whole rail is the
 * yellow CTA above the footer, which is a FILL with dark ink on it.
 *
 * ── How the groups are headed ──────────────────────────────────────────────
 *
 * Sprig's own flat product rail carries no headings at all — five items do not
 * need them. Its SETTINGS rail does, and that is the pattern this copies,
 * because an institution owner's tree is nineteen sections and sixty modules:
 * a sentence-case heading in bold, near-black ink at the SAME size as the
 * items, with the items themselves in mid-grey beneath it.
 *
 * Not a tiny uppercase grey overline. That is the house style of a different
 * product, it makes the heading quieter than the thing it heads, and it was
 * the single most obvious tell that this was not Sprig.
 *
 * ── Where the collapse control lives ───────────────────────────────────────
 *
 * On the hairline itself, straddling the rail's right edge — see `RailToggle`.
 *
 * ── The words are not the API's words ──────────────────────────────────────
 *
 * The tree arrives labelled with the module registry's catalogue names, which
 * are written for a catalogue: "Classes, Cohorts and Learning Groups". The rail
 * renders through `useNavLabels`, which gives each destination a NAME at rail
 * width and takes that name from the institution's own vocabulary — so one row
 * says Classes to a school, Cohorts to a university and Cohorts to a training
 * provider, from one build.
 */
export function Sidebar() {
  const { access, tenant, account, membership } = useTenant()
  const collapsed = useUiStore((s) => s.railCollapsed)
  const toggleRail = useUiStore((s) => s.toggleRail)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)
  const signOut = useSignOut()
  const navLabel = useNavLabels()
  const location = useLocation()
  const navigate = useNavigate()

  const session = access?.calendar?.session
  const period = access?.calendar?.period
  const sections = access?.navigation.sections ?? []
  const quickActions = access?.navigation.quick_actions ?? []

  /* `access` arrives on a second request after `/auth/me`, so there is a real
   * moment where the person is signed in and the rail has nothing to draw. An
   * empty rail during it reads as "this account has no modules", which is a
   * different and alarming statement. */
  const navLoading = access === null

  /* Longest-prefix match, so `/students/01a0…` keeps "Students" lit rather
   * than lighting nothing. An equality test loses the active state the moment
   * anybody opens a detail screen. */
  const activeKey = useMemo(() => {
    const path = location.pathname
    let best: { key: string; length: number } | null = null

    for (const section of sections) {
      for (const item of section.children) {
        if (!item.route) continue
        const href = `/${item.route}`
        if (path === href || path.startsWith(`${href}/`)) {
          if (!best || href.length > best.length) best = { key: item.key, length: href.length }
        }
      }
    }
    return best?.key ?? null
  }, [location.pathname, sections])

  /* Built once: the collapsed rail and the expanded one open the same menu,
   * and two copies would be two places for "Your account" to go missing. */
  const accountMenu: MenuItemSpec[] = [
    {
      key: 'account',
      label: 'Your account',
      icon: <UserCircle size={15} />,
      onSelect: () => navigate({ to: '/account' }),
    },
    {
      key: 'signout',
      label: 'Sign out',
      icon: <SignOut size={15} />,
      destructive: true,
      separated: true,
      onSelect: signOut,
    },
  ]

  return (
    <nav
      aria-label="Main"
      className={cn(
        'relative flex h-dvh shrink-0 flex-col border-r border-gray-200 bg-rail transition-[width] duration-200',
        collapsed ? 'w-rail-collapsed' : 'w-rail',
      )}
    >
      {/* ── Wordmark ──────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex min-h-14 shrink-0 items-center gap-2 py-2',
          collapsed ? 'justify-center px-2' : 'pl-3 pr-1.5',
        )}
      >
        <Link
          to="/dashboard"
          className="flex min-w-0 flex-1 items-center gap-2.5"
          onClick={() => setMobileNavOpen(false)}
          /* The wordmark is a way home, not a nav item. Without this, TanStack
           * stamps `aria-current="page"` on it whenever /dashboard is open and
           * two elements claim to be the current page — the Dashboard row in
           * the tree below is the one that means it. */
          activeProps={{ 'aria-current': undefined }}
        >
          <BrandMark />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block text-sm font-extrabold leading-5 tracking-[-0.02em] text-gray-900 [overflow-wrap:anywhere]">
                {tenant.name}
              </span>
              {/* Where the removed header bar's caption went. Every academic
                * screen is implicitly scoped to these, and a screen showing a
                * term's figures without saying which term is one somebody will
                * misread. */}
              {(session || period) && (
                <span className="block truncate text-xs leading-4 text-gray-600">
                  {[session?.name, period?.name].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          )}
        </Link>
        {!collapsed && (
          <RailToggle collapsed={collapsed} onToggle={toggleRail} className="ml-auto hidden lg:flex" />
        )}
      </div>

      {collapsed && (
        <div className="hidden justify-center pb-1 lg:flex">
          <RailToggle collapsed={collapsed} onToggle={toggleRail} />
        </div>
      )}

      {/* ── Sections ──────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {navLoading && <RailSkeleton collapsed={collapsed} />}

        {sections.map((section, index) => (
          <Section
            key={section.key}
            section={section}
            collapsed={collapsed}
            activeKey={activeKey}
            first={index === 0}
            navLabel={navLabel}
            onNavigate={() => setMobileNavOpen(false)}
          />
        ))}
      </div>

      {/* ── The one saturated thing in the rail ───────────────────────── */}
      {quickActions.length > 0 && (
        <div className={cn('shrink-0', collapsed ? 'px-2 pb-2' : 'px-3 pb-2')}>
          <QuickCreate actions={quickActions} collapsed={collapsed} navLabel={navLabel} />
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className={cn('shrink-0 border-t border-gray-200 pt-2', collapsed ? 'px-2' : 'px-2')}>
        <FooterLink
          to="/notifications"
          icon={<Bell size={20} weight="bold" />}
          label="Notifications"
          collapsed={collapsed}
        />
        <FooterLink to="/help" icon={<Question size={20} weight="bold" />} label="Help" collapsed={collapsed} />
        <FooterLink to="/settings" icon={<Gear size={20} weight="bold" />} label="Settings" collapsed={collapsed} />
      </div>

      {/* ── Account ───────────────────────────────────────────────────── */}
      {/*
        * Two controls, not one.
        *
        * The person is a LINK to their own account, because that is what
        * clicking your own name means everywhere else on the web — and the
        * caret beside it opens the menu that also holds signing out. One
        * button doing both meant the only way to reach your profile was
        * through a menu you had to know was there.
        *
        * Collapsed there is no room for two, so the avatar opens the menu and
        * "Your account" inside it is the way through.
        */}
      <div className="shrink-0 border-t border-gray-200 p-2">
        {collapsed ? (
          <Menu
            align="start"
            side="top"
            className="w-52"
            items={accountMenu}
            trigger={({ toggle, ref }) => (
              <button
                ref={ref as never}
                type="button"
                onClick={toggle}
                aria-label={account?.name ? `${account.name} — account menu` : 'Account menu'}
                className="flex w-full items-center justify-center rounded-md px-1 py-1.5 transition-colors hover:bg-gray-200"
              >
                <Avatar name={account?.name} size="sm" />
              </button>
            )}
          />
        ) : (
          <div className="flex items-center gap-1">
            <Link
              to="/account"
              onClick={() => setMobileNavOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-gray-200"
              activeProps={{ className: 'bg-rail-active' }}
            >
              <Avatar name={account?.name} size="sm" className="shrink-0" />

              {/* `overflow-hidden` as well as `min-w-0`: the truncation below
                * only clips if this column is genuinely bounded, and a long
                * address is the common case rather than the edge one. */}
              <span className="min-w-0 flex-1 overflow-hidden text-left">
                <span className="block truncate text-sm font-semibold leading-5 text-gray-900">
                  {account?.name ?? 'Signed in'}
                </span>
                <span className="block truncate text-xs leading-4 text-gray-600">
                  {membership?.is_platform_admin ? 'Platform admin' : (account?.email ?? '')}
                </span>
              </span>
            </Link>

            <Menu
              align="end"
              side="top"
              className="w-52"
              items={accountMenu}
              trigger={({ toggle, ref, open }) => (
                <button
                  ref={ref as never}
                  type="button"
                  onClick={toggle}
                  aria-label="Account menu"
                  aria-expanded={open}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors',
                    'hover:bg-gray-200 hover:text-gray-900',
                    open && 'bg-gray-200 text-gray-900',
                  )}
                >
                  <CaretUpDown size={15} weight="bold" />
                </button>
              )}
            />
          </div>
        )}
      </div>

    </nav>
  )
}

/**
 * The collapse control, in the wordmark row — the same place Sprig puts it.
 *
 * A ghost caret, 32px, right of the institution name. When the rail is
 * collapsed there is no room beside the mark, so the same button sits on the
 * row underneath. Hidden below `lg`, where the rail is a drawer.
 */
function RailToggle({
  collapsed,
  onToggle,
  className,
}: {
  collapsed: boolean
  onToggle: () => void
  className?: string
}) {
  const Caret = collapsed ? CaretRight : CaretLeft

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!collapsed}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-500',
        'transition-colors duration-150',
        'hover:bg-gray-200 hover:text-gray-900',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400',
        className,
      )}
    >
      <Caret size={16} weight="bold" />
    </button>
  )
}

/**
 * One domain group.
 *
 * ── Static, not an accordion ───────────────────────────────────────────────
 *
 * Sprig's grouped rail — its Settings sub-nav, which is the right reference for
 * a tree this long — shows every item at once under a plain bold heading. There
 * is no disclosure chevron, nothing collapses, and the heading is text rather
 * than a control.
 *
 * An accordion was tried here and removed. It buys vertical space at the cost
 * of the one thing this rail is for: seeing what the institution has. With
 * nineteen sections shut, the reader is looking at a list of nouns and has to
 * guess which one holds the screen they want — and every guess that misses
 * costs two clicks instead of the one the flat rail charges. The heading also
 * stops being readable as a heading the moment it becomes a button: it grows a
 * chevron, a hover fill and a hit area, and then competes with the rows beneath
 * it for the same attention.
 *
 * Groups are separated by whitespace instead. That is what Sprig does, and it
 * is why the gap above a heading is generous while the gap under it is not.
 *
 * A section whose items would all be hidden renders nothing at all, so the
 * whitespace never opens under an empty heading.
 */
function Section({
  section,
  collapsed,
  activeKey,
  first,
  navLabel,
  onNavigate,
}: {
  section: NavigationItem
  collapsed: boolean
  activeKey: string | null
  first: boolean
  navLabel: NavLabels
  onNavigate: () => void
}) {
  /*
   * Four modules are hidden here and shown in Settings instead — Structure,
   * Sessions, Periods and Year groups are the institution's shape rather than
   * places anyone works, and they were sitting above Programmes and Subjects
   * in the list the registrar actually uses.
   *
   * The set comes from `features/settings/sections`, which is also what builds
   * the Settings sub-nav, so a module cannot end up hidden here and missing
   * there. Nothing about the API changes: the modules still resolve, the
   * permissions still gate, and every route behind them still re-checks
   * server-side. Where a link lives is the one thing `NavigationResource`
   * deliberately leaves to the client.
   */
  const items = section.children.filter(
    (item) => item.route && !SETTINGS_OWNED_MODULES.has(item.module_id ?? item.key),
  )
  if (items.length === 0) return null

  return (
    <div className={cn(first ? 'pt-1' : 'pt-5')}>
      {!collapsed && (
        <p className="px-2.5 pb-1.5 text-sm font-bold leading-5 text-gray-900">
          {navLabel.section(section)}
        </p>
      )}
      {/* Collapsed to the icon rail there is no room for a heading, so the
       *  grouping is carried by a short rule instead. */}
      {collapsed && !first && <div className="mx-auto my-2 h-px w-6 bg-gray-300" aria-hidden />}

      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavRow
            key={item.key}
            item={item}
            collapsed={collapsed}
            active={item.key === activeKey}
            navLabel={navLabel}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  )
}

function NavRow({
  item,
  collapsed,
  active,
  navLabel,
  onNavigate,
}: {
  item: NavigationItem
  collapsed: boolean
  active: boolean
  navLabel: NavLabels
  onNavigate: () => void
}) {
  const label = navLabel.item(item)

  /* The registry's full name, but only where it says something the short one
   * does not, and only on a row that is showing its label — the collapsed rail
   * already has a tooltip, and two tooltips on one target is one too many. */
  const full = !collapsed && label !== item.label ? item.label : undefined

  /* Typed `string` on purpose. `Link` validates `to` against the literal route
   * tree, and this destination is a segment the API invented — most of them
   * land on the catch-all `/$module`, which no literal can describe. Widening
   * to `string` is the router's own opt-out for a path computed at runtime;
   * the alternative is asserting a route this build cannot know exists. Same
   * reason `FooterLink` below takes a `string`. */
  const href: string = `/${item.route}`

  const row = (
    <Link
      to={href}
      onClick={onNavigate}
      title={full}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg text-sm leading-5 transition-colors',
        collapsed ? 'h-10 w-10 justify-center' : 'h-10 px-2.5',
        active
          ? 'bg-rail-active font-semibold text-gray-900'
          : 'font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      <ModuleIcon
        name={item.icon ?? item.key}
        size={20}
        weight="bold"
        className={cn('shrink-0', active ? 'text-gray-900' : 'text-gray-500')}
      />
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          {item.badge && (
            <Badge tone="brand" className="ml-auto shrink-0">
              {item.badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  )

  return (
    <li>
      {collapsed ? (
        <Tooltip content={label} className="flex justify-center">
          {row}
        </Tooltip>
      ) : (
        row
      )}
    </li>
  )
}

/**
 * The yellow button.
 *
 * Sprig's is "New Study +"; here it opens the handful of things this person
 * does most — drawn from `quick_actions`, which the API builds from the
 * modules they actually hold, so a bursar's list is financial and a teacher's
 * is not.
 */
function QuickCreate({
  actions,
  collapsed,
  navLabel,
}: {
  actions: NavigationItem[]
  collapsed: boolean
  navLabel: NavLabels
}) {
  const navigate = useNavigate()

  return (
    <Menu
      align="start"
      side="top"
      fullWidth={!collapsed}
      className="w-52"
      items={actions
        .filter((action) => action.route)
        .map((action) => ({
          key: action.key,
          label: navLabel.item(action),
          icon: <ModuleIcon name={action.icon ?? action.key} size={18} weight="bold" />,
          onSelect: () => navigate({ to: `/${action.route}` }),
        }))}
      trigger={({ toggle, ref }) => (
        <button
          ref={ref as never}
          type="button"
          onClick={toggle}
          aria-label="Quick actions"
          className={cn(
            'flex items-center rounded-lg bg-brand-400 font-semibold text-gray-900 transition-colors hover:bg-brand-500',
            collapsed
              ? 'h-10 w-10 justify-center'
              : 'h-10 w-full justify-between px-3.5 text-sm',
          )}
        >
          {collapsed ? (
            <Plus size={18} weight="bold" />
          ) : (
            <>
              <span>Quick actions</span>
              <Plus size={16} weight="bold" />
            </>
          )}
        </button>
      )}
    />
  )
}

function FooterLink({
  to,
  icon,
  label,
  collapsed,
}: {
  to: string
  icon: React.ReactNode
  label: string
  collapsed: boolean
}) {
  const row = (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-lg text-sm leading-5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900',
        collapsed ? 'h-10 w-10 justify-center' : 'h-10 px-2.5',
      )}
      activeProps={{ className: 'bg-rail-active text-gray-900 font-semibold' }}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )

  return collapsed ? (
    <Tooltip content={label} className="flex justify-center">
      {row}
    </Tooltip>
  ) : (
    row
  )
}

/** Sized like the real rail so nothing shifts when the tree lands. */
function RailSkeleton({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="pt-1" aria-hidden>
      {[4, 3, 5].map((rows, group) => (
        <div key={group} className={group === 0 ? '' : 'pt-4'}>
          {!collapsed && <div className="mx-2 mb-2 h-2 w-16 animate-pulse rounded bg-gray-200" />}
          {Array.from({ length: rows }).map((_, row) => (
            <div
              key={row}
              className={cn(
                'mb-1 flex items-center gap-2',
                collapsed ? 'h-8 justify-center' : 'h-7 px-2',
              )}
            >
              <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-gray-200" />
              {!collapsed && (
                <div
                  className="h-2.5 animate-pulse rounded bg-gray-200"
                  style={{ width: `${50 + ((group * 3 + row) % 4) * 12}%` }}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** The mark. Yellow tile, dark glyph — the same relationship the CTA has. */
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
