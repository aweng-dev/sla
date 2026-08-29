import type { KeyboardEvent } from 'react'
import { cn } from '@/shared/lib/cn'
import { humanize } from '@/shared/lib/format'
import { Tooltip } from '@/shared/ui'
import type { DomainCoverage, ModuleCoverage } from './coverage'
import { ratio } from './coverage'

/**
 * The fingerprint of a permission set.
 *
 * Each cell is one domain (atlas) or one module (detail). Fill rises from the
 * bottom as more of that group is granted; a full cell goes ink; a yellow pip
 * marks a privileged grant. Empty is a hairline. The pattern is the point —
 * a bursar and a form tutor are the same 15px title until you see the map.
 *
 * Cells are real buttons when they do something, so the map is a keyboard
 * grid (arrows move, Enter activates) rather than a picture of one.
 */

type Density = 'domain' | 'module'

export function CoverageMap({
  domains,
  density = 'domain',
  activeKey,
  onSelect,
  size = 'md',
  className,
}: {
  domains: DomainCoverage[]
  density?: Density
  /** The cell that currently owns the picker / the scroll target. */
  activeKey?: string | null
  onSelect?: (key: string) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  const cells: { key: string; label: string; held: number; total: number; privileged: number }[] =
    density === 'domain'
      ? domains.map((d) => ({
          key: d.domain,
          label: humanize(d.domain),
          held: d.held,
          total: d.total,
          privileged: d.privilegedHeld,
        }))
      : domains.flatMap((d) =>
          d.modules.map((m) => ({
            key: m.module,
            label: m.name,
            held: m.held,
            total: m.total,
            privileged: m.privilegedHeld,
          })),
        )

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onSelect || cells.length === 0) return
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(event.key)) return

    const node = event.currentTarget
    const buttons = [...node.querySelectorAll<HTMLButtonElement>('button[data-coverage-key]')]
    if (buttons.length === 0) return

    const columns = columnsIn(buttons)
    const current = buttons.findIndex((b) => b === document.activeElement)
    const index = current < 0 ? 0 : current

    let next = index
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    else if (event.key === 'ArrowRight') next = Math.min(buttons.length - 1, index + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, index - columns)
    else if (event.key === 'ArrowDown') next = Math.min(buttons.length - 1, index + columns)

    event.preventDefault()
    buttons[next]?.focus()
  }

  return (
    <div
      role={onSelect ? 'grid' : 'img'}
      aria-label={density === 'domain' ? 'Coverage by domain' : 'Coverage by module'}
      onKeyDown={onSelect ? onKeyDown : undefined}
      className={cn('flex flex-wrap', size === 'sm' ? 'gap-1' : 'gap-1.5', className)}
    >
      {cells.map((cell, index) => (
        <HeatCell
          key={cell.key}
          cellKey={cell.key}
          label={cell.label}
          held={cell.held}
          total={cell.total}
          privileged={cell.privileged}
          active={activeKey === cell.key}
          tabbable={
            onSelect
              ? activeKey
                ? activeKey === cell.key
                : index === 0
              : false
          }
          onSelect={onSelect}
          size={size}
        />
      ))}
    </div>
  )
}

export function HeatCell({
  cellKey,
  label,
  held,
  total,
  privileged = 0,
  active,
  tabbable,
  onSelect,
  size = 'md',
}: {
  cellKey: string
  label: string
  held: number
  total: number
  privileged?: number
  active?: boolean
  tabbable?: boolean
  onSelect?: (key: string) => void
  size?: 'md' | 'sm'
}) {
  const fill = ratio(held, total)
  const title = `${label}: ${held} of ${total}${privileged > 0 ? ` · ${privileged} privileged` : ''}`
  const interactive = Boolean(onSelect)

  const inner = (
    <span
      className={cn(
        'relative block overflow-hidden rounded-md border transition-[border-color,background-color] duration-150',
        size === 'sm' ? 'h-4 w-4' : 'h-7 w-7',
        fill === 0 && 'border-gray-200 bg-gray-50',
        fill > 0 && fill < 1 && 'border-gray-300 bg-white',
        fill === 1 && 'border-gray-900 bg-gray-900',
        active && 'ring-2 ring-accent-500/50 ring-offset-1',
        interactive && 'group-hover:border-gray-900',
      )}
    >
      {fill > 0 && fill < 1 && (
        <span
          className="absolute inset-x-0 bottom-0 bg-gray-900 motion-safe:transition-[height] motion-safe:duration-200"
          style={{ height: `${Math.max(12, Math.round(fill * 100))}%` }}
          aria-hidden
        />
      )}
      {privileged > 0 && (
        <span
          className={cn(
            'absolute rounded-full bg-brand-400',
            size === 'sm' ? 'right-px top-px h-1 w-1' : 'right-0.5 top-0.5 h-1.5 w-1.5',
            fill === 1 && 'ring-1 ring-gray-900',
          )}
          aria-hidden
        />
      )}
    </span>
  )

  if (!interactive) {
    return (
      <Tooltip content={title} side="top">
        <span className="inline-flex">{inner}</span>
      </Tooltip>
    )
  }

  return (
    <Tooltip content={title} side="top">
      <button
        type="button"
        data-coverage-key={cellKey}
        tabIndex={tabbable ? 0 : -1}
        aria-label={title}
        aria-pressed={fill > 0}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelect?.(cellKey)}
        className="group inline-flex rounded-md focus-visible:outline-none"
      >
        {inner}
      </button>
    </Tooltip>
  )
}

export function CoverageLegend({ className }: { className?: string }) {
  return (
    <ul
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-gray-600', className)}
    >
      <li className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-gray-200 bg-gray-50" aria-hidden />
        None
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="relative h-3 w-3 overflow-hidden rounded-sm border border-gray-300 bg-white" aria-hidden>
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gray-900" />
        </span>
        Some
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-gray-900 bg-gray-900" aria-hidden />
        All
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="relative h-3 w-3 rounded-sm border border-gray-900 bg-gray-900" aria-hidden>
          <span className="absolute right-px top-px h-1 w-1 rounded-full bg-brand-400" />
        </span>
        Privileged
      </li>
    </ul>
  )
}

/** A compact fill bar for a module row in the picker. */
export function CoverageBar({ module }: { module: ModuleCoverage }) {
  const fill = ratio(module.held, module.total)
  return (
    <span
      className="relative inline-block h-1.5 w-16 overflow-hidden rounded-full bg-gray-100"
      aria-hidden
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-200',
          fill === 1 ? 'bg-gray-900' : 'bg-gray-700',
        )}
        style={{ width: `${Math.round(fill * 100)}%` }}
      />
    </span>
  )
}

function columnsIn(buttons: HTMLButtonElement[]): number {
  if (buttons.length < 2) return 1
  const firstTop = buttons[0].offsetTop
  let count = 0
  for (const button of buttons) {
    if (button.offsetTop !== firstTop) break
    count += 1
  }
  return Math.max(1, count)
}
