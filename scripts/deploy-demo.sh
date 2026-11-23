#!/usr/bin/env bash
# ============================================================
# Deploy the public demo (server/src/demo) to its own Vercel project.
# ============================================================
# Deploys the CURRENT git HEAD to the `speaking-demo` Vercel project
# (https://speaking-demo.baileymeyers.com), fully apart from production:
#   - builds from a throwaway git worktree, so this repo's `.vercel` link and
#     `.env` are never touched or uploaded
#   - the demo's own vercel.json: the schema goes to the demo database
#     (DEMO_DATABASE_URL*, schema speaking_demo, never DATABASE_URL), the
#     listings copy is filled from production's public API at build, and the
#     only cron is the daily listings refresh (no scrapers, no enrichment)
#   - functions in iad1, next to the demo database
#
# The project's env vars (set once): DEMO_MODE=true, JWT_SECRET, CRON_SECRET,
# ANTHROPIC_API_KEY and WEB_SEARCH_API_KEY (production's, for live search),
# DEMO_LIVE_SEARCH_DAILY_LIMIT, ENRICHMENT_DAILY_LIMIT, PAGE_READER_DAILY_LIMIT,
# plus the Neon store connected with the "DEMO" prefix.
#
# Usage:  bash scripts/deploy-demo.sh
set -euo pipefail

PROJECT="speaking-demo"
SCOPE="baileys-projects-e4327322"

REPO_ROOT="$(git rev-parse --show-toplevel)"
REF="$(git rev-parse HEAD)"

if [ ! -f "$REPO_ROOT/server/src/demo/routes.ts" ]; then
  echo "ERROR: current HEAD ($REF) doesn't contain the demo (server/src/demo)." >&2
  exit 1
fi

WT_PARENT="$(mktemp -d)"
WT="$WT_PARENT/$PROJECT"
cleanup() { git -C "$REPO_ROOT" worktree remove --force "$WT" 2>/dev/null || true; rm -rf "$WT_PARENT"; }
trap cleanup EXIT

echo "Deploying $PROJECT from $REF ..."
git -C "$REPO_ROOT" worktree add --detach "$WT" "$REF" >/dev/null

cat > "$WT/vercel.json" <<'JSON'
{
  "buildCommand": "test -n \"$DEMO_DATABASE_URL_UNPOOLED\" && npx prisma generate && DATABASE_URL=\"$(node scripts/demo-schema-url.mjs)\" npx prisma db push && npm run build && node server/dist/scripts/demoRefreshListings.js",
  "outputDirectory": "client/dist",
  "framework": "vite",
  "regions": ["iad1"],
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 60
    }
  },
  "redirects": [
    {
      "source": "/:path*",
      "has": [{ "type": "host", "value": "speaking-demo.vercel.app" }],
      "destination": "https://speaking-demo.baileymeyers.com/:path*",
      "permanent": true
    }
  ],
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }] }
  ],
  "crons": [
    { "path": "/api/cron/demo-listings", "schedule": "30 6 * * *" }
  ]
}
JSON

vercel link --yes --project "$PROJECT" --scope "$SCOPE" --cwd "$WT" >/dev/null
vercel deploy --prod --yes --scope "$SCOPE" --cwd "$WT" --build-env DEMO_MODE=true --build-env VITE_DEMO_MODE=true

echo "Done → https://speaking-demo.baileymeyers.com"
