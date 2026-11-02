#!/usr/bin/env bash
# Builds the runtime-only release bundle. Runs on the CI runner from the repository root.
# Output: dist/bookleaf-release.tgz - the code, the built frontend and the runtime files. Nothing else:
# no .env, no database, no uploads, no git history, no dev dependencies.
set -euo pipefail

npm run build                      # client build (Vite) -> client/dist

OUT=dist/release
rm -rf dist && mkdir -p "$OUT/server" "$OUT/client"
cp package.json package-lock.json "$OUT/"
cp server/package.json "$OUT/server/"
cp client/package.json "$OUT/client/"
cp -r server/src "$OUT/server/src"
cp -r server/data "$OUT/server/data"
cp -r client/dist "$OUT/client/dist"
cp deploy/Dockerfile.runtime "$OUT/Dockerfile"
cp deploy/docker-compose.yml "$OUT/docker-compose.yml"

# Safety net: refuse to package anything that looks like a secret or local data.
if find "$OUT" \( -name '.env*' -o -name '*.db' -o -name '*.db-*' -o -name 'storage' -o -name 'uploads' \) | grep -q .; then
  echo "release contains secret or local-data files - aborting" >&2
  exit 1
fi

tar czf dist/bookleaf-release.tgz -C "$OUT" .
echo "release: $(ls -l dist/bookleaf-release.tgz | awk '{print $5}') bytes, $(tar tzf dist/bookleaf-release.tgz | wc -l) entries"
