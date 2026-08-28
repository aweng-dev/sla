#!/bin/sh
# Typecheck the project, then report only errors this session is responsible
# for. Another Claude session is concurrently building features/{guardians,
# reports,finance} and adds its routes to app/router.tsx before writing the
# pages — so "Cannot find module '@/features/<theirs>/…'" is its work in
# progress, not a fault here, and must not be "fixed" from this session.
cd "$(dirname "$0")/.." || exit 1
npx tsc -b --noEmit 2>&1 \
  | grep -E '^src/(features/(academics|learning)|shared|app)/' \
  | grep -vE "Cannot find module '@/features/(finance|guardians|reports)/" \
  || echo "✓ no errors in academics/, learning/, shared/, app/"
