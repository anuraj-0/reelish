// Daily consistent copy of the Reelish database (works with WAL). Run as the reelish user.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, statSync, unlinkSync } from "node:fs";
const dir = "/var/backups/reelish";
const out = `${dir}/reelish-${new Date().toISOString().slice(0, 10)}.db`;
try { unlinkSync(out); } catch {}
new DatabaseSync("/var/lib/reelish/reelish.db").exec(`VACUUM INTO '${out}'`);
for (const f of readdirSync(dir)) {
  if (/^reelish-.*\.db$/.test(f) && Date.now() - statSync(`${dir}/${f}`).mtimeMs > 14 * 864e5) unlinkSync(`${dir}/${f}`);
}
console.log(JSON.stringify({ event: "reelish_backup", out }));
