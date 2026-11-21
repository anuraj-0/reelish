# Deployment plan: Reelish on the shared VPS (draft for approval)

**Status: plan only.** Nothing has been run on the server. Step 0 is a read-only inspection. Every later step
needs your approval. DeepClean.app's files, services, Nginx server block and certificates are **not touched**.

Placeholders to confirm during inspection: domain `reelish.example.com`, port `3101`, Node path
`/opt/reelish/node`.

## Shape

```
Internet ─▶ Nginx (existing) ─┬─ deepclean server block (unchanged)
                              └─ reelish.example.com ─▶ 127.0.0.1:3101  reelish-web.service    (next start)
                                                                         reelish-worker.service (jobs)
                                                both ─▶ /var/lib/reelish/reelish.db (SQLite, WAL)
```

| Item | Value |
|---|---|
| Linux user | `reelish` (system user, no login shell, no sudo) |
| Code | `/opt/reelish/releases/<git-sha>/`, with `/opt/reelish/current` a symlink to the live release |
| Node | Node 22 LTS, **its own copy** at `/opt/reelish/node` (official tarball). We don't touch whatever Node DeepClean uses |
| Port | `127.0.0.1:3101`, localhost only (`next start -H 127.0.0.1`). The default binds every interface |
| Secrets | `/etc/reelish/env`, `root:root`, mode `600`, read by systemd (`EnvironmentFile`) |
| Database | `/var/lib/reelish/reelish.db` (+ `-wal`, `-shm`), owned by `reelish`, directory mode `700` |
| Backups | `/var/backups/reelish/`, daily, 14 kept |
| Logs | stdout → journald (`journalctl -u reelish-web -u reelish-worker`). JSON lines, secrets redacted |

## Runtime requirements (verified locally)
- **Node ≥ 22.13** for `node:sqlite` without a flag. Tested on 22.23.5. Node 20, the default `node` on this
  Mac, fails with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. **Check what the VPS has; don't upgrade the
  system Node if DeepClean uses it.**
- Next.js 16.4.6 (needs ≥ 20.9; satisfied).
- **The worker runs through `tsx`, a devDependency**, so install with `npm ci` (dev dependencies included), not
  `npm ci --omit=dev`.
- `sharp` (image optimisation) ships platform-specific binaries. **Run `npm ci` on the VPS**; never copy
  `node_modules` from the Mac.
- Disk per release: about 650 MB `node_modules` plus up to about 300 MB `.next`. We keep 2 releases.
- `next build` can need about 1–2 GB of RAM. Check free memory (`free -m`) during inspection. If memory is
  tight, build while traffic is low, or add swap (asks first).
- No other system packages are needed. Backups use Node's SQLite, not the `sqlite3` CLI.

## Environment (`/etc/reelish/env`)

```ini
NODE_ENV=production
REELISH_PIPELINE=live            # fail loudly instead of quietly serving fixtures if a key is missing
REELISH_DB_PATH=/var/lib/reelish/reelish.db
TRUST_PROXY=true                 # only because Nginx sets X-Real-IP; see below
YOUTUBE_API_KEY=…                # production key, restricted to the YouTube Data API
OPENROUTER_API_KEY=…             # a NEW production key with a credit limit (not the dev key)
SUPADATA_API_KEY=…               # only if Instagram is switched on
INSTAGRAM_ENABLED=false          # until you decide on the permission risk (PLATFORM-CONSTRAINTS.md)
DAILY_AI_BUDGET_USD=0.50
MAX_JOB_COST_USD=0.12
RATE_LIMIT_PER_HOUR=6
SUPADATA_DAILY_CREDITS=10
SUPADATA_MONTHLY_CREDITS=60      # leaves headroom on the free plan's 100
```

The release directory must contain **no `.env` files**. The worker and Next.js both load `.env*` from their
working directory, and those would override nothing but could leak dev keys into production.

## systemd units

`/etc/systemd/system/reelish-web.service`
```ini
[Unit]
Description=Reelish web (Next.js)
After=network.target

[Service]
User=reelish
Group=reelish
WorkingDirectory=/opt/reelish/current
EnvironmentFile=/etc/reelish/env
Environment=PATH=/opt/reelish/node/bin:/usr/bin:/bin
Environment=NODE_OPTIONS=--disable-warning=ExperimentalWarning
ExecStart=/opt/reelish/node/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3101
Restart=always
RestartSec=3
# Hardening: read-only system, writable only where we need it.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/reelish /opt/reelish/current/.next/cache
MemoryMax=768M

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/reelish-worker.service`: the same, except:
```ini
Description=Reelish background worker
ExecStart=/opt/reelish/node/bin/node node_modules/tsx/dist/cli.mjs --conditions=react-server --disable-warning=ExperimentalWarning worker/index.ts
KillSignal=SIGTERM
TimeoutStopSec=30          # the worker gives running jobs 20 s, then they're recovered on start
ReadWritePaths=/var/lib/reelish
MemoryMax=512M
```

**Surviving restarts:**
- Jobs and recipes live in the database file, not in either process.
- The web process only inserts jobs, and the worker claims them atomically.
- If the worker stops mid-job, the job keeps its `running` state. On the next start, jobs with no heartbeat for
  30 s are requeued (attempts permitting), and cached paid results mean a retry doesn't pay twice. Integration tests
  cover stale-job recovery, and a regression test (`0795ce4`) covers recipes surviving a restart.
- Restarting `reelish-web` never affects the worker, and the reverse.
- `Restart=always` brings either one back after a crash or a reboot.

## Nginx (a new file only)

`/etc/nginx/sites-available/reelish` (symlinked into `sites-enabled`; adjust to the server's layout). Zone names
are prefixed `reelish_` so they can't clash with DeepClean's.

```nginx
limit_req_zone $binary_remote_addr zone=reelish_start:10m rate=6r/m;
limit_req_zone $binary_remote_addr zone=reelish_all:10m  rate=10r/s;

server {
    listen 80;
    server_name reelish.example.com;
    location /.well-known/acme-challenge/ { root /var/www/reelish-acme; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name reelish.example.com;
    ssl_certificate     /etc/letsencrypt/live/reelish.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/reelish.example.com/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    client_max_body_size 16k;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $remote_addr;   # overwrite: never pass on client-supplied values
    proxy_set_header X-Forwarded-Proto $scheme;

    # Starting a job: tight per-IP limit at the edge (the app also limits per hour).
    location ~ ^/(api/jobs|start)$ {
        limit_req zone=reelish_start burst=5 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3101;
    }
    location / {
        limit_req zone=reelish_all burst=40 nodelay;
        proxy_pass http://127.0.0.1:3101;
    }
}
```

`/api/jobs/<id>` (polling, about once a second) falls under `reelish_all` only, not the job-start limit.

- **HTTPS:** `certbot certonly --webroot -w /var/www/reelish-acme -d reelish.example.com`. This only obtains a
  certificate; certbot doesn't edit any Nginx file.
  - First enable only the port-80 block, then add the 443 block once the certificate exists.
  - Renewal uses the existing certbot timer. Check `certbot renew --dry-run`.
- **Always run `nginx -t` before `systemctl reload nginx`.** Reload, not restart, so DeepClean's connections
  aren't dropped.

## Spending limits (several layers)

1. **OpenRouter:** a separate production key with a **credit limit** (say $5) set in the OpenRouter dashboard.
   This is the hard ceiling, even if our code has a bug.
2. **App:** `DAILY_AI_BUDGET_USD` (rolling 24 h) and `MAX_JOB_COST_USD` (per call). Calls are reserved at worst
   case before they're made.
3. **Supadata:** the free plan stops at 100 credits a month. The app's own daily, 30-day and per-job caps sit
   below that.
4. **YouTube Data API:** 10,000 units a day free; we use 1 per new video. Restrict the key to this API (and to
   the server's IP if possible).
5. **Per visitor:** Nginx `limit_req`, plus `RATE_LIMIT_PER_HOUR` per visitor (salted hash of the real IP).
   Cache hits are free and not limited.

When a cap is reached, new jobs end with the "limited" message. Nothing is charged, and cached recipes keep
working.

## Many visitors at once
- Each submission is a row in `jobs`. Submitting the same video again joins the same job (unique index), and an
  already-made recipe returns at once with no job.
- **One worker, 2 jobs at a time.** A job takes about 5–18 s, so expect roughly 7–20 new recipes a minute. Later
  visitors see the "queued" state and wait. Ten new videos at once means up to about a minute for the last one.
- Supadata's free plan allows 1 request per second. Calls are spaced in-process, and a 429 is retried with
  backoff.
- SQLite in WAL mode with a 5 s busy timeout. Writes are tiny and both processes share one file. That's fine at
  this scale. If it ever isn't, the move is PostgreSQL behind `lib/db/` (decision D7).
- **Risk:** if the worker is down, jobs queue silently. The health check below catches this.

## Commands

```bash
# Status and logs
systemctl status reelish-web reelish-worker
journalctl -u reelish-worker -f            # JSON lines: job_started / job_succeeded / job_failed …
journalctl -u reelish-web --since "1 hour ago"

# Health (all should pass)
curl -fsS -o /dev/null -w '%{http_code}\n' https://reelish.example.com/                  # 200
curl -s  -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/r/yt-healthcheck         # 404 = app and database OK (500 = database problem)
systemctl is-active reelish-worker                                                       # active
sudo -u reelish /opt/reelish/node/bin/node -e '
  const db = new (require("node:sqlite").DatabaseSync)("/var/lib/reelish/reelish.db", { readOnly: true });
  console.log(db.prepare("SELECT COUNT(*) n, MIN(created_at) oldest FROM jobs WHERE status = ?").get("queued"));
  console.log(db.prepare("SELECT ROUND(SUM(cost_usd),4) usd FROM processing_runs WHERE created_at > ?").get(Date.now() - 864e5));'
# A queued job older than ~2 minutes means the worker isn't processing.

# Restart (either one alone is safe)
sudo systemctl restart reelish-worker
sudo systemctl restart reelish-web
```

### Deploying a release
```bash
sudo -u reelish bash -c '
  set -e
  cd /opt/reelish/releases
  git clone --depth 1 <repo> "$SHA" && cd "$SHA" && git checkout "$SHA"
  test ! -e .env && test ! -e .env.local
  export PATH=/opt/reelish/node/bin:$PATH
  npm ci
  npm run build'
sudo -u reelish /opt/reelish/node/bin/node /opt/reelish/backup.mjs   # backup before switching
sudo ln -sfn /opt/reelish/releases/$SHA /opt/reelish/current
sudo systemctl restart reelish-worker reelish-web
# then run the health checks
```

### Rollback
```bash
sudo ln -sfn /opt/reelish/releases/<previous-sha> /opt/reelish/current
sudo systemctl restart reelish-worker reelish-web
```
- Database changes so far are additive (new columns only), so an older release runs against a newer database.
- If a future release changes the schema in a way that isn't additive, restore the pre-deploy backup with both
  services stopped.

### Backups
`/opt/reelish/backup.mjs` (owned by root, run by a daily systemd timer as `reelish`) makes a consistent online
copy, even with WAL:
```js
import { DatabaseSync } from "node:sqlite";
const out = `/var/backups/reelish/reelish-${new Date().toISOString().slice(0, 10)}.db`;
new DatabaseSync("/var/lib/reelish/reelish.db").exec(`VACUUM INTO '${out}'`);
```
- Prune with `find /var/backups/reelish -name 'reelish-*.db' -mtime +14 -delete`.
- **Restore:** stop both services, copy the backup over `reelish.db`, delete `reelish.db-wal` and
  `reelish.db-shm`, then start both.
- The database holds no user accounts or personal data, only recipes, jobs, cached creator text and hashed IP
  buckets. Losing it costs re-processing, not user data.

## Deployment-specific assumptions found in the code

| Assumption | Status |
|---|---|
| `/start` (no-JS form) redirected to an absolute URL built from `request.url`, which is `localhost:3101` behind Nginx | **Fixed** (`d0d4ed6`): relative `Location`. Found by testing the production build with proxy headers |
| The rate limit took the *first* `X-Forwarded-For` entry, which visitors can forge | **Fixed** (`f473083`): `X-Real-IP` or the last entry; Nginx overwrites both |
| Without `TRUST_PROXY`, every visitor shares one rate-limit bucket | Set `TRUST_PROXY=true` behind our Nginx only |
| Missing keys quietly switch the app to the fixtures demo | Set `REELISH_PIPELINE=live`, so a missing key makes jobs fail (`job_failed` in the log) instead. Check that the keys are present before the first start |
| The database path defaults to `./data/` in the working directory, which is inside the release | Set `REELISH_DB_PATH` |
| `next start` binds every interface | `-H 127.0.0.1` in the unit; also check the firewall |
| `ReelishBot/0.1` user agent has no contact URL | Open (`PLATFORM-CONSTRAINTS.md`); add one before launch |
| The worker loads `.env`/`.env.local` from its working directory | Release check: no `.env*` files |
| Node 22 needed, system Node may be older | Separate Node in `/opt/reelish/node` |

## What we'll inspect first (read-only, step 0)

`uname -a; lsb_release -a; free -m; df -h; nproc` ·
`node -v; which node` (and what DeepClean's unit uses) ·
`systemctl list-units --type=service | grep -i -E 'deepclean|node|nginx'` ·
`ss -ltnp` (free ports, nothing on 3101) ·
`nginx -v; nginx -T | grep -E 'server_name|listen|include|limit_req_zone'` ·
`ls /etc/letsencrypt/live; systemctl list-timers | grep certbot` ·
`ufw status` or `iptables -S` ·
DNS: `dig +short reelish.example.com`.
