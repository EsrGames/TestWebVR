#!/usr/bin/env bash
# Copies every tracked file of this (development) repo into the publication repo and removes
# files that were deleted here. Then commits there if the gate passes. Never pushes.
#   bash .claude/sync-publish.sh "Mensaje del commit"
set -euo pipefail
SRC="$(git rev-parse --show-toplevel)"
DST="${PUBLISH_REPO:-D:/Users/Usuario/Documents/Unity_new/TestWebVR}"
MSG="${1:?commit message required}"
cd "$SRC"
git ls-files > /tmp/sync-src.txt
while IFS= read -r f; do
  mkdir -p "$DST/$(dirname "$f")"
  cp "$SRC/$f" "$DST/$f"
done < /tmp/sync-src.txt
cd "$DST"
git ls-files | while IFS= read -r f; do
  grep -qxF "$f" /tmp/sync-src.txt || git rm -q "$f"
done
if [ -z "$(git status --porcelain)" ]; then echo "publish repo already up to date"; exit 0; fi
npm run check > /tmp/sync-check.log 2>&1 || { echo "GATE FAILED in publish repo"; tail -20 /tmp/sync-check.log; exit 1; }
git add -A
git commit -q -m "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1
