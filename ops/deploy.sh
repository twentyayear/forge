#!/usr/bin/env bash
#
# ops/deploy.sh — deploy WORKHART (frontend + API) to the alphaecho.io droplet.
#
# Usage: ./ops/deploy.sh
set -euo pipefail

TARGET="${WORKHART_DEPLOY_TARGET:-deploy@137.184.19.44}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/5] building frontend"
npm run build

echo "==> [2/5] rsync dist/ -> /srv/workhart/web"
rsync -az --delete dist/ "$TARGET:/srv/workhart/web/"

echo "==> [3/5] rsync server/ -> /srv/workhart/server"
rsync -az --delete --exclude node_modules --exclude .env server/ "$TARGET:/srv/workhart/server/"

echo "==> [4/5] remote: npm ci --omit=dev, restart workhart-api"
ssh -o BatchMode=yes "$TARGET" 'set -e; cd /srv/workhart/server && npm ci --omit=dev && sudo systemctl restart workhart-api'

echo "==> [5/5] verify"
sleep 1
RESPONSE="$(curl -fsS https://alphaecho.io/api/health)"
echo "$RESPONSE"
echo "$RESPONSE" | grep -q '"ok":true' || { echo "FATAL: health check did not report ok:true"; exit 1; }

echo "==> deploy OK"
