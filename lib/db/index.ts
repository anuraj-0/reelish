import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * The only module that knows we use SQLite (decision D7). One file holds recipes, jobs,
 * processing runs and the source cache. Both the web process and the worker open it;
 * WAL mode lets them read and write at the same time.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  video_key TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS recipes_by_video ON recipes (video_key, pipeline_version, created_at);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  video_key TEXT NOT NULL,
  platform TEXT NOT NULL,
  video_id TEXT NOT NULL,
  url TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  stages TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  error_code TEXT,
  recipe_id TEXT,
  client_hash TEXT,
  created_at INTEGER NOT NULL,
  run_after INTEGER NOT NULL,
  started_at INTEGER,
  heartbeat_at INTEGER,
  finished_at INTEGER
);
-- At most one queued or running job per video: duplicate submissions join the existing job.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_per_video ON jobs (video_key) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs (status, run_after, created_at);
CREATE INDEX IF NOT EXISTS jobs_by_client ON jobs (client_hash, created_at);
CREATE INDEX IF NOT EXISTS jobs_by_video ON jobs (video_key, created_at);

-- One row per external call (or reserved call). Source of truth for spend and latency.
CREATE TABLE IF NOT EXISTS processing_runs (
  id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  worst_case_usd REAL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_by_time ON processing_runs (created_at);
CREATE INDEX IF NOT EXISTS runs_by_job ON processing_runs (job_id);

-- Raw responses from external sources, so retries and re-normalising don't pay twice.
CREATE TABLE IF NOT EXISTS source_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL);
`;

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  return db;
}

const holder = globalThis as { __reelishDb?: Db };

/** The shared connection for this process (survives dev hot reloads). */
export function getDb(): Db {
  holder.__reelishDb ??= openDb(process.env.REELISH_DB_PATH || path.join(process.cwd(), "data", "reelish.db"));
  return holder.__reelishDb;
}

/** Tests: use an in-memory or temporary database. */
export function setDbForTests(db: Db | undefined) {
  holder.__reelishDb = db;
}

/** Runs fn inside BEGIN IMMEDIATE so check-then-insert sequences are atomic across processes. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** A random per-database secret, used to hash client addresses (never stored raw). */
export function getSecretSalt(db: Db): string {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'client_salt'").get() as { value: string } | undefined;
  if (row) return row.value;
  const salt = randomBytes(16).toString("hex");
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('client_salt', ?)").run(salt);
  return (db.prepare("SELECT value FROM meta WHERE key = 'client_salt'").get() as { value: string }).value;
}

// ---- Source cache -------------------------------------------------------------------------

export function cacheGet<T>(db: Db, key: string, maxAgeMs: number, now = Date.now()): T | undefined {
  const row = db.prepare("SELECT data, fetched_at FROM source_cache WHERE key = ?").get(key) as { data: string; fetched_at: number } | undefined;
  if (!row || now - row.fetched_at > maxAgeMs) return undefined;
  return JSON.parse(row.data) as T;
}

export function cachePut(db: Db, key: string, value: unknown, now = Date.now()) {
  db.prepare("INSERT INTO source_cache (key, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at").run(
    key,
    JSON.stringify(value),
    now,
  );
}
