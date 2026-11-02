#!/usr/bin/env bash
# FIXED launcher, installed once on the server at /opt/bookleaf/deploy/launch.sh (root-owned, not writable by CI).
# The only thing the restricted 'bookleaf-deploy' user may run, via sudo. It does the minimum:
# check the tarball location, unpack the release, then hand over to the deploy logic INSIDE that release.
# The deploy logic therefore ships with each push, while this launcher stays fixed.
set -euo pipefail

TARBALL="${1:-}"
BL=/opt/bookleaf
case "$TARBALL" in
  "$BL/incoming/"*.tgz) ;;
  *) echo "refusing: $TARBALL is not in $BL/incoming" >&2; exit 1 ;;
esac
[ -f "$TARBALL" ] || { echo "missing tarball" >&2; exit 1; }

STAMP=$(date +%Y%m%d%H%M%S)
REL="$BL/releases/$STAMP"
mkdir -p "$REL"
tar xzf "$TARBALL" -C "$REL"
rm -f "$TARBALL"
chown -R root:root "$REL"

[ -f "$REL/deploy/remote-deploy.sh" ] || { echo "release has no deploy script" >&2; exit 1; }
exec bash "$REL/deploy/remote-deploy.sh" "$STAMP" "$REL"
