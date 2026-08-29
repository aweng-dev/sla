import { useEffect, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { initials } from '@/shared/lib/format'

/**
 * Sprig's avatars are small, circular and pastel-tinted.
 *
 * The tint is derived from the name rather than stored, so the same person is
 * the same colour on every screen without the API having to carry one — and
 * the palette it picks from is the categorical set, so an avatar grid never
 * shows a colour that is not in the system.
 */

/**
 * Sprig's avatars are pastel and predominantly lavender — a roster reads as one
 * quiet column, not a colour wheel. So the accent leads and appears twice, and
 * the categorical hues are the exception rather than an even split.
 */
const TINTS = [
  'bg-accent-100 text-accent-800',
  'bg-gray-100 text-gray-700',
  'bg-accent-50 text-accent-700',
  'bg-magenta-100 text-magenta-800',
  'bg-teal-100 text-teal-800',
  'bg-coral-100 text-coral-800',
] as const

const SIZES = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-7 w-7 text-[11px]',
  lg: 'h-9 w-9 text-xs',
  xl: 'h-16 w-16 text-lg',
} as const

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string | null | undefined
  /** The avatar endpoint streams bytes and hands out no URL, so this is an
   *  object URL the caller made — never a link from the API. */
  src?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  /* Reset on a new source. Without this a single `onError` — a revoked object
   * URL, a truncated blob — latches for the life of the component, so a photo
   * uploaded a moment later still renders as initials. */
  useEffect(() => {
    setFailed(false)
  }, [src])

  let hash = 0
  const key = name ?? '?'
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0
  const tint = TINTS[Math.abs(hash) % TINTS.length]

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full font-semibold uppercase',
        SIZES[size],
        tint,
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
