#!/usr/bin/env bash
# Build the app and publish it to Vercel: the static site plus the sync function under /api.
# First time: run `npx vercel@65.12.1 login`, then this script links a project named ma16200-study.
# The finished build is deployed as is; Vercel does not rebuild it. It only packages api/sync.js,
# which needs the project's Redis variables (KV_REST_API_URL and KV_REST_API_TOKEN); see README.
# Pass --preview to publish a preview deployment instead of production.
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

# the sync function: plain JavaScript with no packages, so there is nothing to install or build
mkdir -p "$SITE/api"
cp api/_core.js api/sync.js "$SITE/api/"
printf '{ "private": true, "type": "module" }\n' > "$SITE/package.json"

if [ ! -f "$SITE/.vercel/project.json" ]; then
  $VERCEL link --cwd "$SITE" --project ma16200-study --yes
fi
if [ "${1:-}" = "--preview" ]; then
  $VERCEL deploy --cwd "$SITE" --yes
else
  $VERCEL deploy --cwd "$SITE" --prod --yes
fi
