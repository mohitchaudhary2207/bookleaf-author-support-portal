#!/usr/bin/env bash
# Runs ON THE SERVER as root, started by the fixed launcher (deploy/launch.sh) from INSIDE the new release.
# Arguments: <timestamp> <release directory>
# Order: back up live data -> build image -> switch container -> health check -> roll back on failure.
# It never writes the database or the uploads, never reseeds, and never touches the Jerry AI containers or nginx.
set -euo pipefail

STAMP="${1:?timestamp}"
REL="${2:?release dir}"
BL=/opt/bookleaf
DOMAIN=bookleaf.206.189.178.199.nip.io
LOG=/var/log/bookleaf/deploy.log

mkdir -p /var/log/bookleaf
exec > >(tee -a "$LOG") 2>&1
echo "=== deploy $STAMP ($(date -u +%FT%TZ))"

# 1. Back up live data BEFORE anything changes. Abort if the backup cannot be made.
BACKUP_DIR=/var/lib/bookleaf/data/backups
mkdir -p "$BACKUP_DIR" /var/lib/bookleaf/backups
chown 1000:1000 "$BACKUP_DIR"          # the container's 'node' user writes the backup
docker exec bookleaf node -e "
  const D = require('better-sqlite3');
  const db = new D('/data/bookleaf.db');
  db.backup('/data/backups/bookleaf-$STAMP.db').then(() => { db.close(); console.log('db backup ok'); })
    .catch((e) => { console.error('db backup FAILED', e.message); process.exit(1); });
"
[ -s "$BACKUP_DIR/bookleaf-$STAMP.db" ] || { echo "database backup missing - aborting, nothing changed"; exit 1; }
chown root:root "$BACKUP_DIR/bookleaf-$STAMP.db" && chmod 600 "$BACKUP_DIR/bookleaf-$STAMP.db"   # backups hold password hashes: root only
tar czf "/var/lib/bookleaf/backups/uploads-$STAMP.tgz" -C /var/lib/bookleaf uploads 2>/dev/null || true
echo "backups: $BACKUP_DIR/bookleaf-$STAMP.db"

# 2. Keep the currently running image and release as the rollback target, then build the new one.
PREVIOUS_REL=$(readlink -f "$BL/current" 2>/dev/null || true)
docker tag bookleaf:release bookleaf:previous 2>/dev/null || true
ln -sfn "$REL" "$BL/current"
cp "$REL/docker-compose.yml" "$BL/docker-compose.yml"
cd "$BL"
docker compose build bookleaf

# 5. Switch the container. Data volumes are unchanged.
docker compose up -d bookleaf

# 6. Health check through the public HTTPS name (resolved locally, so it tests nginx + app together).
healthy=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 8 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/v1/health" | grep -q '"status":"ok"'; then
    healthy=1; break
  fi
  sleep 3
done

if [ "$healthy" -eq 1 ]; then
  echo "health check passed"
else
  echo "HEALTH CHECK FAILED - rolling back to the previous image and release"
  docker logs bookleaf --tail 30 || true
  if docker image inspect bookleaf:previous >/dev/null 2>&1; then
    docker tag bookleaf:previous bookleaf:release
    [ -n "$PREVIOUS_REL" ] && ln -sfn "$PREVIOUS_REL" "$BL/current"
    docker compose up -d bookleaf
    echo "rolled back. data was not touched; backup kept at $BACKUP_DIR/bookleaf-$STAMP.db"
  else
    echo "no previous image to roll back to - manual action needed"
  fi
  exit 1
fi

# 7. Housekeeping: keep the 5 newest releases and the 10 newest database backups. Nothing else is removed.
ls -1dt "$BL"/releases/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf
ls -1t "$BACKUP_DIR"/bookleaf-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
echo "=== deploy $STAMP succeeded"
