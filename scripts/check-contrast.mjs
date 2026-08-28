#!/usr/bin/env node
/**
 * Asserts the contrast of the pairings this app actually renders.
 *
 * ── Why a fixed list and not a crawler ─────────────────────────────────────
 *
 * Because the question is not "could any two palette colours be combined
 * badly" — of course they could — but "does the product put THESE two
 * together". The list below is every foreground/background pair the app
 * genuinely paints, and each entry names where. Adding a new pairing to the
 * product means adding a line here.
 *
 * The pairing this exists for is the yellow. #f8d030 on white is 1.6:1, which
 * is why `--sl-cta` and `--sl-accent` are separate tokens and why nothing may
 * render yellow as text. The `cta-on-white-TEXT` case is listed as a
 * deliberate FAIL expectation so that anybody who "fixes" it by making yellow
 * a text colour trips this file.
 */

import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const { neutral, accent, brand, success, danger, surface } = await import(
  pathToFileURL(join(ROOT, 'palette.js')).href
)

const WHITE = surface.white

function channel(value) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** [name, foreground, background, minimum, where] */
const PAIRS = [
  ['body text on canvas', neutral[900], WHITE, 4.5, 'every screen'],
  ['secondary text on canvas', neutral[600], WHITE, 4.5, 'descriptions, body copy'],
  ['muted text on canvas', neutral[500], WHITE, 4.5, 'table headers, hints, second lines'],
  ['body text on rail', neutral[900], surface.rail, 4.5, 'Sidebar nav labels'],
  ['nav label on rail', neutral[800], surface.rail, 4.5, 'Sidebar inactive items'],
  ['section overline on rail', neutral[600], surface.rail, 4.5, 'Sidebar section labels (11px uppercase)'],
  ['muted text on rail', neutral[500], surface.rail, 4.3, 'Sidebar account email — 11px, against the off-white ground'],
  ['header label on table head', neutral[700], surface.tableHead, 4.5, 'DataTable header row'],
  ['ink on CTA yellow', neutral[900], brand[400], 4.5, 'Button variant="primary"'],
  ['ink on yellow tint', neutral[900], brand[200], 4.5, 'Badge tone="brand"'],
  ['accent as text on canvas', accent[500], WHITE, 4.5, 'links, Button variant="link"'],
  ['accent text on accent tint', accent[700], accent[50], 4.5, 'Badge tone="accent"'],
  ['danger text on canvas', danger[500], WHITE, 4.5, 'Field errors, destructive menu items'],
  ['danger text on danger tint', danger[700], danger[50], 4.5, 'Badge tone="danger"'],
  ['white on danger fill', WHITE, danger[500], 4.5, 'Button variant="danger"'],
  ['success text on success tint', success[700], success[50], 4.5, 'Badge tone="success"'],
  ['white on inverted chrome', WHITE, surface.inkDeep, 4.5, 'BulkActionBar, Tooltip, Toaster'],
  ['muted on inverted chrome', neutral[200], surface.inkDeep, 4.5, 'BulkActionBar clear button'],
  ['ink on cream', neutral[900], surface.cream, 4.5, 'sign-in illustration panel'],
  ['strong border on canvas', neutral[300], WHITE, 1.3, 'input and button borders (non-text)'],
  ['hairline on canvas', neutral[200], WHITE, 1.1, 'card and row separators (non-text)'],
  ['decorative grey on canvas', neutral[400], WHITE, 2, 'inactive carets, disabled glyphs (non-text)'],
]

/** Pairings that MUST fail. Listed so a well-meaning change that makes yellow
 *  legible as text — by darkening the brand ramp — is caught here rather than
 *  shipping a different product. */
const MUST_FAIL = [['CTA yellow AS TEXT on canvas', brand[400], WHITE, 3]]

let failed = 0
const rows = []

for (const [name, fg, bg, min, where] of PAIRS) {
  const r = ratio(fg, bg)
  const pass = r >= min
  if (!pass) failed += 1
  rows.push([pass ? '✓' : '✗', name, `${r.toFixed(2)}:1`, `min ${min}`, where])
}

for (const [name, fg, bg, ceiling] of MUST_FAIL) {
  const r = ratio(fg, bg)
  const correct = r < ceiling
  if (!correct) failed += 1
  rows.push([
    correct ? '✓' : '✗',
    `${name} (must stay illegible)`,
    `${r.toFixed(2)}:1`,
    `< ${ceiling}`,
    'yellow is a FILL, never text',
  ])
}

const width = Math.max(...rows.map((r) => r[1].length))
for (const [mark, name, got, want, where] of rows) {
  console.log(`${mark} ${name.padEnd(width)}  ${got.padStart(8)}  ${want.padEnd(8)}  ${where}`)
}

if (failed > 0) {
  console.error(`\n✗ ${failed} pairing(s) fail. Fix the palette, not this file.`)
  process.exit(1)
}

console.log(`\n✓ All ${rows.length} rendered pairings pass.`)
