import { logActivity } from "@/lib/activity";
import { HttpError, bundle, handle, requireProject, type Ctx } from "@/lib/api";
import { db, getParts, updatePart, updateProject } from "@/lib/db";
import { readFileByUrl } from "@/lib/storage";
import { analyzeSeries } from "@/lib/ai/analyze";
import { transcribeVideo } from "@/lib/ai/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Transcribes any parts still missing a transcript, then scores the whole series with the LLM. */
export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  let parts = getParts(id);
  if (!parts.length) throw new HttpError(400, "Split the video first.");
  for (const p of parts.filter((x) => x.transcript === null)) {
    const transcript = await transcribeVideo(await readFileByUrl(p.video_url), project.language);
    updatePart(p.id, { transcript });
  }
  parts = getParts(id);
  const { summary, results } = await analyzeSeries(project, parts);
  db().transaction(() => {
    for (const r of results) updatePart(r.id, { ai_score: r.score, ai_important: r.important, ai_reason: r.reason });
    updateProject(id, { ai_summary: summary });
  })();
  const important = results.filter((r) => r.important).length;
  logActivity(id, null, "AI analysis finished", `${important} of ${results.length} parts marked important`);
  return bundle(id);
});
