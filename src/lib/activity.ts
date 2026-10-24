import { randomUUID } from "node:crypto";
import { db } from "./db";

export function logActivity(projectId: string, partId: string | null, event: string, detail?: string) {
  db()
    .prepare("INSERT INTO activity_logs (id, project_id, part_id, event, detail, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), projectId, partId, event, detail ?? null, new Date().toISOString());
}
