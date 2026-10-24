import { logActivity } from "@/lib/activity";
import { HttpError, bundle, handle, requireProject, type Ctx } from "@/lib/api";
import { db, getParts, renumberParts, updatePart, updateProject } from "@/lib/db";
import { generateCaptions } from "@/lib/ai/captions";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  const parts = getParts(id);
  if (!parts.length) throw new HttpError(400, "Split the video first.");
  if (parts.some((p) => !["queued", "awaiting_approval"].includes(p.status))) throw new HttpError(409, "The series is locked after approval.");
  const { seriesTitle, results } = await generateCaptions(project, parts);
  db().transaction(() => {
    for (const r of results) updatePart(r.id, { caption: r.caption, hashtags: r.hashtags });
    if (seriesTitle) {
      updateProject(id, { title: seriesTitle });
      // Reset titles to the auto pattern so they pick up the new series title.
      for (const p of parts) updatePart(p.id, { title: "" });
    }
  })();
  if (seriesTitle) renumberParts(id, seriesTitle);
  logActivity(id, null, "AI captions generated", `Series title: ${seriesTitle}`);
  return bundle(id);
});
