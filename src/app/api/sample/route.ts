import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logActivity } from "@/lib/activity";
import { handle } from "@/lib/api";
import { getSetting, insertPart, insertProject } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { partTitle, type Project } from "@/lib/types";

export const runtime = "nodejs";

const SAMPLE_TITLE = "Kochi Food Trail";
const SAMPLE_DURATIONS = [10.97, 12.5, 11.93, 10.63];

/** Creates a ready-made demo project with 4 short clips that contain speech. */
export const POST = handle(async () => {
  const project: Project = {
    id: randomUUID(),
    title: SAMPLE_TITLE,
    content_type: "Vlog or challenge",
    language: "English",
    original_video_url: null,
    part_length_seconds: 15,
    merge_short_last: true,
    add_part_badge: false,
    crop_9_16: true,
    simulate_failure: getSetting("simulate_failure", "0") === "1",
    failure_simulated: false,
    send_important_only: false,
    status: "review",
    rights_confirmed: true,
    ai_summary: null,
    created_date: new Date().toISOString(),
  };
  insertProject(project);
  logActivity(project.id, null, "Sample project loaded", "4 demo clips with speech");
  const total = SAMPLE_DURATIONS.length;
  let start = 0;
  for (let i = 0; i < total; i++) {
    const n = i + 1;
    const data = await fs.promises.readFile(path.join(process.cwd(), "sample", `clip${n}.mp4`));
    const partId = randomUUID();
    const url = await saveFile(`projects/${project.id}/parts/${partId}.mp4`, data);
    insertPart({
      id: partId,
      project_id: project.id,
      part_number: n,
      total_parts: total,
      title: partTitle(SAMPLE_TITLE, n, total),
      caption: "",
      hashtags: [],
      video_url: url,
      start_seconds: start,
      duration_seconds: SAMPLE_DURATIONS[i],
      order: n,
      status: "queued",
      delivery_method: null,
      delivery_proof: null,
      error_message: null,
      idempotency_key: randomUUID(),
      transcript: null,
      ai_score: null,
      ai_important: false,
      ai_reason: null,
      attempts: 0,
      file_size: data.length,
    });
    start += SAMPLE_DURATIONS[i];
  }
  return { project };
});
