#!/usr/bin/env bash
# Build the app and publish it to Vercel as a static site.
# First time: run `npx vercel@65.12.1 login`, then this script links a project named ma16200-study.
# The finished build is deployed as is; Vercel does not rebuild it.
set -euo pipefail
cd "$(dirname "$0")/.."

VERCEL="npx --yes vercel@65.12.1"
SITE=.deploy

pnpm lint
pnpm test
pnpm build

# keep the Vercel project link (.deploy/.vercel) between deploys, replace everything else
mkdir -p "$SITE"
find "$SITE" -mindepth 1 -maxdepth 1 ! -name .vercel -exec rm -rf {} +
cp -r dist/. "$SITE"/

if [ ! -f "$SITE/.vercel/project.json" ]; then
  $VERCEL link --cwd "$SITE" --project ma16200-study --yes
fi
$VERCEL deploy --cwd "$SITE" --prod --yes
