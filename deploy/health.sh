#!/bin/sh
# Reelish health check (root, every 5 min). Only ever touches reelish-* units.
code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:3101/reelish/r/yt-healthcheck)
if [ "$code" != "404" ]; then
  echo "reelish_health web_unhealthy code=$code"; systemctl restart reelish-web
fi
age=$(runuser -u reelish -- /opt/reelish/node/bin/node --disable-warning=ExperimentalWarning -e '
  const db = new (require("node:sqlite").DatabaseSync)("/var/lib/reelish/reelish.db", { readOnly: true });
  const r = db.prepare("SELECT MIN(created_at) t FROM jobs WHERE status = ?").get("queued");
  console.log(r && r.t ? Math.round((Date.now() - new Date(r.t).getTime()) / 1000) : 0);' 2>/dev/null || echo 0)
if [ "${age:-0}" -gt 180 ]; then
  echo "reelish_health worker_restarted oldest_queued_s=$age"; systemctl restart reelish-worker
fi
