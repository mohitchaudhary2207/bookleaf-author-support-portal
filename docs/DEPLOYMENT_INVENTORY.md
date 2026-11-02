# Deployment inventory - pre-deployment VPS audit

Audit date: 2026-11-02. Method: read-only SSH commands only (`ps`, `free`, `df`, `ss`, `docker ps/inspect/stats/system df`,
`ufw status`, reading `docker-compose.yml` and `nginx.conf`). No service was modified by this audit.
Secrets were not read: `.env`, `.env.staging` and the private keys were not opened. Values shown are non-secret.

## 1. Host

| Item | Value |
|---|---|
| Provider / region | DigitalOcean, BLR1 |
| Hostname | `Jerry-AI` |
| Public IPv4 | `206.189.178.199` |
| OS | Ubuntu 24.04.4 LTS |
| CPU / RAM | 1 vCPU / 961 MB |
| Swap | 2 GB file `/swapfile` |
| Disk | 24 GB, 12 GB free |

Resource state:
- Before stopping the existing stack: 913 MB RAM used, 48 MB available, 1.2 GB of swap in use.
- After stopping it (see section 4): 467 MB used, 494 MB available, 661 MB of swap in use.

## 2. Identity of the existing application

The droplet runs the **Jerry AI** stack (domain `jerryai.in`, compose project in `/opt/jerry-ai`), not an application
called JREI.com. The owner must confirm this is the server they meant. See the open questions at the end.

## 3. Running services before the change

| Container | Image | Host port | Restart policy | Notes |
|---|---|---|---|---|
| `pk-nginx` | nginx:1.27-alpine | 80, 443 | always | Public reverse proxy for jerryai.in; config `/opt/jerry-ai/nginx.conf` |
| `pk-app` | jerry-ai-app | 3001 -> 3000 | always | Production API |
| `pk-postgres` | postgres:16-alpine | internal | always | Production DB (volume `jerry-ai_pgdata`) |
| `pk-redis` | redis:7-alpine | internal | always | |
| `pk-certbot` | certbot/certbot | internal | always | Let's Encrypt renewal for jerryai.in |
| `pk-app-staging` | pk-app-staging | 3002 -> 3000 | unless-stopped | Staging API, publicly open in UFW |
| `pk-postgres-staging` | postgres:16-alpine | internal | - | |
| `pk-redis-staging` | redis:7-alpine | internal | - | |

Docker network: `jerry-ai_default` (bridge). All containers are attached to it, so `pk-nginx` reaches apps by container name
(`proxy_pass http://pk-app:3000`).

Certificate: `/etc/letsencrypt/live/jerryai.in/` in volume `jerry-ai_certbot_conf`.

Host listeners before the change: 22 (sshd), 53 (systemd-resolved, localhost), 80/443 (`pk-nginx`), 3001 (`pk-app`),
3002 (`pk-app-staging`). No host Nginx, PM2 or host Node.js. Docker 27 is installed and in use.

## 4. Change made by the owner's request

On 2026-11-02, at the owner's instruction, all eight containers were **stopped** (`docker stop`, nothing removed, no volumes
or images deleted). `pk-app` exited with code 137 (force-killed after the stop timeout); the database containers exited cleanly
(code 0). The PostgreSQL data was not inspected after the stop.

## 5. Firewall

UFW active. Allowed inbound: 22, 80, 443 (IPv4 and IPv6), and 3002 (Jerry AI staging API). Everything else is denied.

## 6. Capacity assessment for BookLeaf

- BookLeaf is one Node 22 process plus SQLite. Expected footprint is roughly 100-150 MB RAM and a few hundred MB of disk.
- With the Jerry AI stack stopped there is about 420 MB free, so BookLeaf can fit alone.
- If the Jerry AI production stack is started again beside BookLeaf, memory will be tight. This must be measured before going live.
- Docker reclaimable: about 320 MB images and 590 MB build cache. Not used for memory; not removed.

## 7. Plan constraints discovered during the audit

1. **Shared nginx config.** BookLeaf's routing must be added to `/opt/jerry-ai/nginx.conf`. A mistake breaks jerryai.in too.
   Back up the file first, run `nginx -t` in the container, and reload only if the test passes.
2. **Upstream names must resolve at nginx start.** `nginx.conf` uses fixed upstream names (`pk-app`, `pk-app-staging`). If those
   containers are stopped, nginx may fail to start or reload. This must be tested with a backup and a rollback ready.
3. **Restart policy.** Stopped containers with `restart: always` come back on reboot. If Jerry AI should stay off, its containers
   must be changed to `unless-stopped`, or removed from the boot path. This is a change to the existing application and needs approval.
4. **BookLeaf must be reachable from the nginx container.** Host-bound `127.0.0.1` ports are not reachable from the container
   network. Recommended: run BookLeaf as its own compose service on the `jerry-ai_default` network, with no published host port.
5. **Certificate.** A new certificate for `bookleaf.206.189.178.199.nip.io` must be issued through the existing certbot container
   and webroot path. Port 80 must reach `pk-nginx`.
6. **DNS.** `bookleaf.206.189.178.199.nip.io` already resolves to `206.189.178.199` (checked from the server and from the owner's PC).
7. **Certificate expiry of jerryai.in** was not read in this audit. Check it before stopping `pk-certbot` for long.

## 8. Hostname

- Planned: `bookleaf.206.189.178.199.nip.io` (resolves correctly).
- Later switch to a purchased domain: add a DNS A record, add a `server_name` and certificate, and update `CORS_ORIGINS` in the
  BookLeaf environment.

## 9. Open questions for the owner

1. Is `206.189.178.199` the droplet that hosts JREI.com? The droplet runs the Jerry AI stack, so if JREI.com is elsewhere, this plan changes.
2. Should Jerry AI stay stopped after BookLeaf is deployed, or run again on the same nginx entry point?
3. Approve the nginx routing change (section 7, items 1-2) before it is applied.
