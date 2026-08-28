#!/bin/sh
# Typecheck the whole project, then report only the errors in the paths this
# session owns. Another Claude session is editing src/features/{guardians,reports}
# concurrently; its in-flight files must not gate this work, and must not be
# "fixed" from here either.
cd "$(dirname "$0")/.." || exit 1
npx tsc -b --noEmit 2>&1 \
  | grep -E '^src/(features/academics|shared|app)/' \
  | grep -v 'error TS0' || echo "✓ no errors in academics/, shared/, app/"
