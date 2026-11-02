#!/usr/bin/env bash
# Stage 1 of the BookLeaf deployment on the shared droplet. Run on the server with: bash -s < setup-bookleaf.sh
# - Unpacks the runtime-only release, writes the image/compose files and the production env file (secrets generated here).
# - Starts the BookLeaf container on the existing jerry-ai_default network with NO published host port.
# - Does NOT touch nginx, the Jerry AI containers, UFW or DNS.
set -eu

BL=/opt/bookleaf
STAMP=$(date +%Y%m%d%H%M%S)
REL="$BL/releases/$STAMP"

umask 077
mkdir -p "$BL/releases" "$REL" /var/lib/bookleaf/data /var/lib/bookleaf/uploads /var/log/bookleaf
tar xzf /tmp/bookleaf-release.tgz -C "$REL"
rm -f /tmp/bookleaf-release.tgz
ln -sfn "$REL" "$BL/current"

# The container runs as the image's 'node' user (uid 1000); give it ownership of its data only.
chown -R 1000:1000 /var/lib/bookleaf/data /var/lib/bookleaf/uploads

cat > "$REL/Dockerfile" <<'DOCKERFILE'
FROM node:22-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
# better-sqlite3 has no prebuilt binary for this platform, so it compiles: the toolchain is installed for this
# one layer and removed again in the same layer, so it does not stay in the image.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci --omit=dev --workspace=server \
 && apt-get purge -y python3 make g++ && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* && npm cache clean --force
COPY server/src ./server/src
COPY server/data ./server/data
COPY client/dist ./client/dist
RUN mkdir -p /data /uploads && chown node:node /data /uploads
USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]
DOCKERFILE

cat > "$BL/docker-compose.yml" <<'COMPOSE'
name: bookleaf
services:
  bookleaf:
    build:
      context: ./current
    image: bookleaf:release
    container_name: bookleaf
    restart: unless-stopped
    env_file: ./.env
    environment:
      DATABASE_PATH: /data/bookleaf.db
      UPLOAD_DIR: /uploads
    volumes:
      - /var/lib/bookleaf/data:/data
      - /var/lib/bookleaf/uploads:/uploads
    expose:
      - "4000"
    networks: [edge]
    mem_limit: 256m
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
networks:
  edge:
    external: true
    name: jerry-ai_default
COMPOSE

# Production env. Secrets are generated on the server and never printed.
if [ ! -f "$BL/.env" ]; then
  JWT=$(openssl rand -hex 48)
  AUTHOR_PW=$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 20)
  ADMIN_PW=$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 20)
  cat > "$BL/.env" <<ENV
NODE_ENV=production
PORT=4000
JWT_SECRET=$JWT
CORS_ORIGINS=https://bookleaf.206.189.178.199.nip.io
AI_ENABLED=true
AI_MODEL=gpt-4o-mini
SEED_DEMO_DATA=true
SEED_AUTHOR_PASSWORD=$AUTHOR_PW
SEED_ADMIN_PASSWORD=$ADMIN_PW
ENV
fi
# Add the OpenAI key from the temporary file uploaded by the caller, then delete that file.
if [ -s "$BL/.openai-key" ] && ! grep -q '^OPENAI_API_KEY=' "$BL/.env"; then
  cat "$BL/.openai-key" >> "$BL/.env"
fi
rm -f "$BL/.openai-key"
chmod 600 "$BL/.env"

cd "$BL"
docker compose build bookleaf 2>&1 | tail -5
docker compose up -d bookleaf
sleep 12
docker ps --filter name=bookleaf --format "{{.Names}}\t{{.Status}}"
echo "--- memory"; free -m | head -2
echo "--- health from inside the Docker network (not public)"
docker exec pk-nginx wget -qO- -T 10 http://bookleaf:4000/api/v1/health || echo "health check failed"
echo
echo "--- env keys present (values not shown):"; sed 's/=.*//' "$BL/.env" | tr '\n' ' '; echo
echo "release: $REL"
