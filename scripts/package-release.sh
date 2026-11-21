#!/usr/bin/env bash
# Builds a self-contained release for the VPS: Next.js standalone server + one-file worker bundle.
# The server then needs only Node 22 (no npm install, no on-server build). See docs/DEPLOYMENT.md.
# Usage: REELISH_BASE_PATH=/reelish scripts/package-release.sh   → release/reelish-<sha>.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."

sha=$(git rev-parse --short HEAD)
[ -z "$(git status --porcelain -- app components hooks lib worker proxy.ts next.config.ts package-lock.json)" ] \
  || { echo "Uncommitted app changes; commit first so the release matches $sha." >&2; exit 1; }

rm -rf .next release && mkdir -p release
npm run build

out=release/reelish-$sha
cp -R .next/standalone "$out"
cp -R .next/static "$out/.next/static"
[ -d public ] && cp -R public "$out/public"
node_modules/.bin/esbuild worker/index.ts --bundle --platform=node --target=node22 --format=esm \
  --conditions=react-server --outfile="$out/worker.mjs" \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

# Never ship local env files or databases.
find "$out" \( -name '.env*' -o -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' \) -print -delete
rm -rf "$out/data"
echo "$sha" > "$out/REVISION"

tar -C release -czf "$out.tar.gz" "reelish-$sha"
du -sh "$out" "$out.tar.gz"
