#!/usr/bin/env node
/**
 * Asserts that the built stylesheet is entirely on the Sprig palette.
 *
 * ── Why this check exists ──────────────────────────────────────────────────
 *
 * `tailwind.config.js` remaps every stock ramp, so `bg-indigo-600` lands on
 * Sprig purple and a developer who reaches for a familiar colour name still
 * gets the right paint. The failure mode is the ramp NOBODY remapped: add
 * `text-lime-400` to a component, forget `lime` in the config, and one
 * element silently ships in stock Tailwind green. It is a single element on a
 * single screen — nobody sees it in review.
 *
 * So the check is on the OUTPUT, not the source. Every colour Tailwind emitted
 * is compared against the palette; anything else is a leak, whether it came
 * from an unmapped ramp or a hex somebody typed into a component.
 *
 * Run after `pnpm build`.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist', 'assets')

const { palette } = await import(pathToFileURL(join(ROOT, 'palette.js')).href)

/** Every hex the palette sanctions, lowercased and un-prefixed. */
const allowed = new Set()
for (const [name, value] of Object.entries(palette)) {
  if (name === 'categorical') {
    for (const hex of value) allowed.add(hex.toLowerCase().slice(1))
  } else if (typeof value === 'object') {
    for (const hex of Object.values(value)) {
      if (typeof hex === 'string' && hex.startsWith('#')) allowed.add(hex.toLowerCase().slice(1))
    }
  }
}

/**
 * Normalise a CSS hex to six digits, dropping any alpha.
 *
 * CSS hexes come in four lengths and Tailwind emits all of them: `#0000` is
 * transparent black (its `ring-offset` default), `#fff3` is white at 20% (an
 * opacity utility), `#f8d030` is a palette colour and `#6a5cc852` is a palette
 * colour with an alpha suffix. Comparing the raw string against the palette
 * flags the first two as leaks, which is how this check reported three
 * failures on a stylesheet that had exactly one real problem.
 */
function normalise(hex) {
  if (hex.length === 3 || hex.length === 4) {
    return hex
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return hex.slice(0, 6)
}

/* Pure black and pure white are not palette colours and never were — they are
 * what `text-white`, `bg-transparent` and the preflight reset emit. */
const IGNORED = new Set(['ffffff', '000000'])

/**
 * Stylesheets this app ships but did not write.
 *
 * ── Why an exception exists at all ─────────────────────────────────────────
 *
 * The curriculum editor imports `@blocknote/core/style.css`, which carries the
 * editor's structural layout and, alongside it, its own text and highlight
 * colour palette. Those hexes reach the output, and they are not ours to
 * rename — the alternative is reimplementing a rich-text editor's layout CSS by
 * hand, which trades a cosmetic rule for a real maintenance burden.
 *
 * ── Why this does not weaken the check ─────────────────────────────────────
 *
 * The allowance is not "this file may contain anything". It is exactly the set
 * of hexes the vendor's own source declares, read from node_modules at check
 * time. A colour hard-coded into OUR stylesheet still fails, because it is not
 * in the vendor's sheet — which is the failure this check was written to catch.
 *
 * If the list ever needs a second entry, it needs the same justification: the
 * sheet is not ours, and the file it is read from is named here.
 */
const VENDOR_STYLESHEETS = [
  /* The `@blocknote/core/style.css` export, by its real path — the package's
     `exports` map points there, and this script reads files rather than
     resolving specifiers. */
  '@blocknote/core/dist/style.css',
]

/** Every hex the vendor sheets declare. Read from source, never hand-listed. */
const vendored = new Set()
for (const specifier of VENDOR_STYLESHEETS) {
  const path = join(ROOT, 'node_modules', specifier)
  let css
  try {
    css = readFileSync(path, 'utf8')
  } catch {
    console.error(`✗ Vendor stylesheet [${specifier}] is not installed — cannot verify its colours.`)
    process.exit(1)
  }

  for (const match of css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
    vendored.add(normalise(match[1].toLowerCase()))
  }
}

let files
try {
  files = readdirSync(DIST).filter((f) => f.endsWith('.css'))
} catch {
  console.error('✗ No dist/assets found. Run `pnpm build` first.')
  process.exit(1)
}

if (files.length === 0) {
  console.error('✗ No stylesheet in dist/assets. Run `pnpm build` first.')
  process.exit(1)
}

const leaks = new Map()

for (const file of files) {
  const css = readFileSync(join(DIST, file), 'utf8')
  for (const match of css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
    const raw = match[1].toLowerCase()
    const hex = normalise(raw)
    if (IGNORED.has(hex) || allowed.has(hex) || vendored.has(hex)) continue
    leaks.set(`#${raw}`, (leaks.get(`#${raw}`) ?? 0) + 1)
  }
}

if (leaks.size === 0) {
  console.log(
    `✓ ${files.length} stylesheet(s) fully on the Sprig palette` +
      ` (plus ${vendored.size} colours declared by ${VENDOR_STYLESHEETS.join(', ')}).`,
  )
  process.exit(0)
}

console.error('✗ Colours outside the palette reached the stylesheet:\n')
for (const [hex, count] of [...leaks].sort((a, b) => b[1] - a[1])) {
  console.error(`   ${hex}  ×${count}`)
}
console.error(
  '\n  Either a stock Tailwind ramp is unmapped in tailwind.config.js, or a\n' +
    '  component hard-codes a colour. Fix the config or move the value into\n' +
    '  src/shared/theme/chartColors.ts — never edit palette.js to match a leak.',
)
process.exit(1)
