import { randomUUID } from "node:crypto";
import { logActivity } from "@/lib/activity";
import { HttpError, handle, requireProject, type Ctx } from "@/lib/api";
import { db, getPart, insertPart, updateProject } from "@/lib/db";
import { MAX_PART_BYTES } from "@/lib/split-math";
import { deleteDir, saveFile } from "@/lib/storage";
import { partTitle } from "@/lib/types";

export const runtime = "nodejs";

/** Uploads one encoded part (multipart form: file, part_number, total_parts, start_seconds, duration_seconds). */
export const POST = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new HttpError(400, "Missing part file");
  if (file.size > MAX_PART_BYTES) throw new HttpError(400, "Part is larger than 20 MB");
  const n = Number(form.get("part_number"));
  const total = Number(form.get("total_parts"));
  if (!Number.isInteger(n) || !Number.isInteger(total) || n < 1 || total < n) throw new HttpError(400, "Invalid part numbers");
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const score = text("ai_score") === null ? null : Math.max(0, Math.min(100, Math.round(Number(text("ai_score")))));
  const partId = randomUUID();
  const url = await saveFile(`projects/${id}/parts/${partId}.mp4`, Buffer.from(await file.arrayBuffer()));
  insertPart({
    id: partId,
    project_id: id,
    part_number: n,
    total_parts: total,
    title: partTitle(project.title, n, total),
    caption: "",
    hashtags: [],
    video_url: url,
    start_seconds: Number(form.get("start_seconds")) || 0,
    duration_seconds: Number(form.get("duration_seconds")) || 0,
    order: n,
    status: "queued",
    delivery_method: null,
    delivery_proof: null,
    error_message: null,
    idempotency_key: randomUUID(),
    transcript: form.has("transcript") ? String(form.get("transcript") ?? "") : null,
    ai_score: Number.isFinite(score) ? score : null,
    ai_important: form.get("ai_important") === "true",
    ai_reason: text("ai_reason"),
    attempts: 0,
    file_size: file.size,
  });
  logActivity(id, partId, "Part uploaded", `Part ${n}/${total} saved (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  if (n === total) {
    updateProject(id, { status: "review" });
    logActivity(id, null, "Splitting finished", `${total} parts ready`);
  }
  return { part: getPart(partId) };
});

/** Clears existing parts before a fresh split. */
export const DELETE = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  if (["delivering", "completed"].includes(project.status)) throw new HttpError(409, "This series has already been sent.");
  db().prepare("DELETE FROM parts WHERE project_id = ?").run(id);
  await deleteDir(`projects/${id}/parts`);
  updateProject(id, { status: "splitting", ai_summary: null, failure_simulated: false });
  logActivity(id, null, "Splitting started");
  return { ok: true };
});
