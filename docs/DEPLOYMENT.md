# Deployment: Reelish on the shared VPS

**Status: live at <https://deepclean.app/reelish>** since 2026-11-22 IST. First release `4d6083c`; then `af44fbb` (start-form fix); `384b6e2` (brutalist redesign); `12ff1e1` (UX pass); now `e901a38` (silent Instagram Reels). The previous
release is kept on the server for rollback. The server also runs
DeepClean.app and a few other small apps owned by the same person. Reelish shares only the machine and the
Nginx process.
DeepClean's files, database, Node and services were not touched.

## The server (inspected 2026-11-22 IST, read-only)

| Item | Found | Consequence |
|---|---|---|
| Machine | Ubuntu 24.04 VPS, **1 vCPU, 961 MB RAM** (~420 MB available), 2 GB swap, **8.7 GB disk, 1.6 GB free** | `npm ci` (~650 MB) plus `next build` (1–2 GB RAM) on the server would have starved the other apps. **We build on the Mac and ship a 51 MB bundle** |
| Running | nginx 1.24 and the other apps' services, all on localhost ports | Port **3101** was free (checked with `ss -ltn` before use) |
| Node | no system `node`; another app has its own Node | Reelish has **its own** Node 22.23.5 in `/opt/reelish/node` (official tarball, SHA-256 checked, npm removed) |
| Nginx | `sites-enabled/deepclean.app` holds the `deepclean.app` 443 block; another app is already mounted under a sub-path via an included snippet | Reelish follows the same pattern under `/reelish` |
| TLS / DNS | Let's Encrypt cert `deepclean.app`, renewed by `certbot.timer`; DNS points straight at the droplet (no Cloudflare: `Server: nginx`, no `cf-ray`) | **No new certificate or DNS record**; `$remote_addr` is the real visitor IP |
| Firewall | ufw: deny incoming except 22, 80, 443 | No change. 3101 is bound to 127.0.0.1 only |

## Shape

```
Internet ─▶ Nginx ── deepclean.app 443 block (existing)
                      ├─ other sub-path apps                    (unchanged)
                      ├─ /reelish/…  → 127.0.0.1:3101  reelish-web.service    (Next.js standalone, basePath /reelish)
                      └─ /           → static DeepClean site (unchanged)
                                        reelish-worker.service (jobs)
                              both ─▶ /var/lib/reelish/reelish.db (SQLite, WAL)
```

| Item | Value |
|---|---|
| Linux user | `reelish` (system user, `nologin`, no sudo) |
| Code | `/opt/reelish/releases/<sha>/` (root-owned, read-only to the app); `/opt/reelish/current` → live release |
| Node | `/opt/reelish/node` (22.23.5; ≥ 22.13 needed for `node:sqlite`) |
| Port | `127.0.0.1:3101` |
| Secrets | `/etc/reelish/env`, `root:root`, mode `600`, read by systemd (`EnvironmentFile`) |
| Database | `/var/lib/reelish/reelish.db` (+ `-wal`, `-shm`), owner `reelish`, directory mode `700` |
| Backups | `/var/backups/reelish/reelish-YYYY-MM-DD.db`, daily at ~03:30 UTC, 14 days kept |
| Logs | journald: `journalctl -u reelish-web -u reelish-worker` (JSON lines; key values never logged) |
| Memory | measured ~55 MB (web) + ~24 MB (worker); capped at `MemoryMax=320M` / `200M` |

All unit files, scripts and Nginx snippets are in [`deploy/`](../deploy/).

## Why the build is different from a normal Next.js deploy

- `next.config.ts` reads **`REELISH_BASE_PATH`** at build time (`/reelish` for this server, empty for local
  dev and the e2e tests). Links and the router get the prefix automatically; raw `fetch()` calls, the no-JS form
  action and the `/start` redirects use `lib/base-path.ts`.
- **`output: "standalone"`**: the server runs `node server.js` with no `node_modules` install.
- **The worker is one esbuild bundle** (`worker.mjs`, ~850 KB, `--conditions=react-server`), so `tsx` isn't
  needed in production.
- **`images.unoptimized`**: the only images are YouTube thumbnails, loaded straight from `i.ytimg.com`. No
  `sharp` binary has to match the server, and the 1 vCPU does no resizing.
- `scripts/package-release.sh` refuses to run with uncommitted app changes, and **deletes any `.env*` or `*.db`
  file** that Next's file tracing copies into the bundle. It did copy the local `.env` and `data/reelish.db` on
  the first build; the script removed both, and a scan of the bundle found no key values.

## Environment (`/etc/reelish/env`, values not shown)

```ini
YOUTUBE_API_KEY=…            # same key as development (owner's decision)
SUPADATA_API_KEY=…           # same key as development
OPENROUTER_API_KEY=…         # same key as development: $20 credit limit on the key itself (owner's decision)
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
REELISH_PIPELINE=live        # a missing key fails jobs loudly instead of serving fixtures
REELISH_DB_PATH=/var/lib/reelish/reelish.db
TRUST_PROXY=true             # Nginx overwrites X-Real-IP / X-Forwarded-For
INSTAGRAM_ENABLED=true       # owner accepted the permission risk, see PLATFORM-CONSTRAINTS.md
DAILY_AI_BUDGET_USD=0.50
MAX_JOB_COST_USD=0.12
RATE_LIMIT_PER_HOUR=6
SUPADATA_DAILY_CREDITS=25    # raised from 10 on 2026-11-22: a silent Reel needs about 8
SUPADATA_MONTHLY_CREDITS=60
SUPADATA_MAX_JOB_CREDITS=12
```

**Deviation from the plan:** the plan called for a separate production OpenRouter key with its own small limit.
The owner chose to reuse the development key (limit $20, $0.11 used by 2026-11-22). The app's $0.50/24 h cap is
therefore the main ceiling; the key limit is the backstop. A separate key can be swapped in later by editing
`OPENROUTER_API_KEY` and restarting both units.

## Nginx changes (approved by the owner, applied 2026-11-22 IST)

1. New `/etc/nginx/conf.d/reelish-limits.conf`: `limit_req_zone`s `reelish_start` (6 r/min) and `reelish_all`
   (10 r/s). No other zone existed.
2. New `/etc/nginx/snippets/reelish.conf` and `reelish-proxy.conf`: `location = /reelish` and
   `location ^~ /reelish/` → `127.0.0.1:3101`. `^~` stops DeepClean's regex locations (`.js`/`.css`/image caching,
   `/index` rewrites) from catching Reelish paths. Job starts (`/reelish/api/jobs`, `/reelish/start`) get the
   tighter zone; polling doesn't.
3. One line in DeepClean's server block, after the other app's include: `include snippets/reelish.conf;`. A backup of
   the original file is in `/root/deepclean.app.nginx.bak-*`.
4. Follow-up (approved): removed `X-Forwarded-Proto` from `reelish-proxy.conf`. With it, unknown recipe links
   returned **500** instead of 404: Next 16 sends the `proxy.ts` 404 rewrite out as an external request to
   `https://localhost:3101`, a plain-HTTP port. Reelish doesn't read the header anywhere.

Each change: `nginx -t` (also tested first on a throwaway copy of `/etc/nginx`), then `systemctl reload nginx`
(not restart). DeepClean, its www redirect, the other sub-path app and DeepClean's API host returned the same codes before and after.

**Not done:** HSTS. It's a host-wide header and would affect DeepClean, so it's DeepClean's call.

## Commands

```bash
# Status and logs
systemctl status reelish-web reelish-worker
journalctl -u reelish-worker -f                # job_started / job_succeeded / job_failed …

# Health
curl -s -o /dev/null -w '%{http_code}\n' https://deepclean.app/reelish                        # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/reelish/r/yt-healthcheck      # 404 = app + DB OK
systemctl list-timers | grep reelish          # reelish-health (5 min), reelish-backup (daily)

# Spend in the last 24 h
sudo runuser -u reelish -- /opt/reelish/node/bin/node -e '
  const db = new (require("node:sqlite").DatabaseSync)("/var/lib/reelish/reelish.db", { readOnly: true });
  console.log(db.prepare("SELECT ROUND(SUM(cost_usd),4) usd FROM processing_runs WHERE created_at > ?").get(Date.now() - 864e5));'

# Instagram off/on (e.g. if Meta or a creator objects)
sudo sed -i 's/^INSTAGRAM_ENABLED=.*/INSTAGRAM_ENABLED=false/' /etc/reelish/env
sudo systemctl restart reelish-web reelish-worker
```

`reelish-health.timer` (root, every 5 min, `/opt/reelish/health.sh`) restarts `reelish-web` if the health URL
doesn't return 404, and `reelish-worker` if a job has been queued for over 3 minutes. It only touches
`reelish-*` units. An external uptime monitor (for example UptimeRobot on `https://deepclean.app/reelish`) is
still worth adding.

## Deploying a release

```bash
# On the Mac (Node 22): build, then copy
REELISH_BASE_PATH=/reelish scripts/package-release.sh          # → release/reelish-<sha>.tar.gz
scp release/reelish-<sha>.tar.gz deepclean:/tmp/

# On the server
cd /opt/reelish/releases && tar -xzf /tmp/reelish-<sha>.tar.gz && mv reelish-<sha> <sha>
chown -R root:root <sha> && install -d -o reelish -g reelish <sha>/.next/cache
find <sha> -name '.env*' -o -name '*.db'                        # must print nothing
systemctl start reelish-backup.service                         # backup before switching
ln -sfn /opt/reelish/releases/<sha> /opt/reelish/current
systemctl restart reelish-worker reelish-web
```

**Rollback:** point `current` at the previous release and restart both units. **Take Reelish offline:**
`systemctl disable --now reelish-web reelish-worker reelish-health.timer reelish-backup.timer`, remove the
`include snippets/reelish.conf;` line, `nginx -t && systemctl reload nginx`. Nothing here names a DeepClean file
or unit.

**Restore a backup:** stop both units, copy the backup over `reelish.db`, delete `reelish.db-wal` and
`reelish.db-shm`, start both. The database holds no accounts or personal data, only recipes, jobs, cached
creator text and salted IP hashes.

## Verified on the live site (2026-11-22 IST)

See the submission test report ("Live site test"). In short: 42/42 browser checks on desktop and
mobile, cache hits free, worker SIGKILL mid-job recovered, budget cap and both rate limits trigger, other sites
unaffected.

## Known limits of this setup

- **One worker, 2 jobs at a time**, about 7–20 new recipes a minute. More visitors wait in "queued".
- SQLite is fine at this scale; the move beyond it is PostgreSQL behind `lib/db/` (decision D7).
- The disk is 83% full (shared). Each release is ~51 MB; delete old ones from `/opt/reelish/releases`.
- If the whole droplet goes down, nothing alerts you until an external uptime check is added.
