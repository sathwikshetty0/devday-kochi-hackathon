import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { ActivityLog, Part, Project } from "./types";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  language TEXT NOT NULL,
  original_video_url TEXT,
  part_length_seconds INTEGER NOT NULL DEFAULT 30,
  merge_short_last INTEGER NOT NULL DEFAULT 1,
  add_part_badge INTEGER NOT NULL DEFAULT 1,
  crop_9_16 INTEGER NOT NULL DEFAULT 0,
  simulate_failure INTEGER NOT NULL DEFAULT 0,
  failure_simulated INTEGER NOT NULL DEFAULT 0,
  send_important_only INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  rights_confirmed INTEGER NOT NULL CHECK (rights_confirmed = 1),
  ai_summary TEXT,
  created_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  total_parts INTEGER NOT NULL,
  title TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  video_url TEXT NOT NULL,
  start_seconds REAL NOT NULL DEFAULT 0,
  duration_seconds REAL NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  delivery_method TEXT,
  delivery_proof TEXT,
  error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  transcript TEXT,
  ai_score INTEGER,
  ai_important INTEGER NOT NULL DEFAULT 0,
  ai_reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  file_size INTEGER
);
CREATE INDEX IF NOT EXISTS parts_project ON parts(project_id);
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  part_id TEXT,
  event TEXT NOT NULL,
  detail TEXT,
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_project ON activity_logs(project_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

class Db {
  constructor(readonly raw: DatabaseSync) {}
  prepare(sql: string) {
    return this.raw.prepare(sql);
  }
  exec(sql: string) {
    this.raw.exec(sql);
  }
  close() {
    this.raw.close();
  }
  /** Same call style as better-sqlite3: db().transaction(fn)() */
  transaction<T>(fn: () => T): () => T {
    return () => {
      this.raw.exec("BEGIN IMMEDIATE");
      try {
        const out = fn();
        this.raw.exec("COMMIT");
        return out;
      } catch (e) {
        this.raw.exec("ROLLBACK");
        throw e;
      }
    };
  }
}

let _db: Db | null = null;

export function db(): Db {
  if (_db) return _db;
  const file = process.env.DB_FILE || path.join(DATA_DIR, "reelix.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  _db = new Db(new DatabaseSync(file));
  _db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  _db.exec(SCHEMA);
  return _db;
}

export function resetDbForTests() {
  _db?.close();
  _db = null;
}

const PROJECT_BOOLS = [
  "merge_short_last", "add_part_badge", "crop_9_16", "simulate_failure",
  "failure_simulated", "send_important_only", "rights_confirmed",
] as const;

type Row = Record<string, unknown>;

export function rowToProject(r: Row): Project {
  const p = { ...r } as Row;
  for (const k of PROJECT_BOOLS) p[k] = !!p[k];
  return p as unknown as Project;
}

export function rowToPart(r: Row): Part {
  return {
    ...(r as unknown as Part),
    hashtags: JSON.parse((r.hashtags as string) || "[]"),
    ai_important: !!r.ai_important,
  };
}

export function getProject(id: string): Project | null {
  const r = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToProject(r) : null;
}

export function listProjects(): Project[] {
  const rows = db()
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM parts WHERE project_id = p.id) AS part_count
       FROM projects p ORDER BY created_date DESC`,
    )
    .all() as Row[];
  return rows.map(rowToProject);
}

export function getParts(projectId: string): Part[] {
  const rows = db()
    .prepare(`SELECT * FROM parts WHERE project_id = ? ORDER BY "order" ASC`)
    .all(projectId) as Row[];
  return rows.map(rowToPart);
}

export function getPart(id: string): Part | null {
  const r = db().prepare("SELECT * FROM parts WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToPart(r) : null;
}

export function getLogs(projectId: string, limit = 200): ActivityLog[] {
  return db()
    .prepare("SELECT * FROM activity_logs WHERE project_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?")
    .all(projectId, limit) as unknown as ActivityLog[];
}

type SqlValue = string | number | bigint | null | Uint8Array;

function toSql(v: unknown) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return JSON.stringify(v);
  return v;
}

export function updateProject(id: string, fields: Partial<Project>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sql = `UPDATE projects SET ${keys.map((k) => `"${k}" = ?`).join(", ")} WHERE id = ?`;
  db().prepare(sql).run(...keys.map((k) => toSql((fields as Row)[k]) as SqlValue), id);
}

export function updatePart(id: string, fields: Partial<Part>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sql = `UPDATE parts SET ${keys.map((k) => `"${k}" = ?`).join(", ")} WHERE id = ?`;
  db().prepare(sql).run(...keys.map((k) => toSql((fields as Row)[k]) as SqlValue), id);
}

export function insertProject(p: Project) {
  const keys = Object.keys(p).filter((k) => k !== "part_count");
  db()
    .prepare(`INSERT INTO projects (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
    .run(...keys.map((k) => toSql((p as unknown as Row)[k]) as SqlValue));
}

export function insertPart(p: Part) {
  const keys = Object.keys(p);
  db()
    .prepare(`INSERT INTO parts (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
    .run(...keys.map((k) => toSql((p as unknown as Row)[k]) as SqlValue));
}

export function getSetting(key: string, fallback: string): string {
  const r = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/** Renumbers parts by current order and refreshes total_parts and auto titles. */
export function renumberParts(projectId: string, projectTitle: string) {
  const parts = getParts(projectId);
  const total = parts.length;
  const tx = db().transaction(() => {
    parts.forEach((p, i) => {
      const n = i + 1;
      const autoTitle = /^.* - Part \d+\/\d+$/.test(p.title) || !p.title;
      updatePart(p.id, {
        order: n,
        part_number: n,
        total_parts: total,
        ...(autoTitle ? { title: `${projectTitle} - Part ${n}/${total}` } : {}),
      });
    });
  });
  tx();
}
