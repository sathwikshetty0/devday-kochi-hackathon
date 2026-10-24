import { logActivity } from "@/lib/activity";
import { HttpError, handle, requireProject, type Ctx } from "@/lib/api";
import { getPart, updatePart } from "@/lib/db";
import { readFileByUrl } from "@/lib/storage";
import { transcribeVideo } from "@/lib/ai/transcribe";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const part = getPart(id);
  if (!part) throw new HttpError(404, "Part not found");
  const project = requireProject(part.project_id);
  const video = await readFileByUrl(part.video_url);
  const transcript = await transcribeVideo(video, project.language);
  updatePart(id, { transcript });
  logActivity(project.id, id, "Transcribed", `Part ${part.part_number}: ${transcript ? `${transcript.split(/\s+/).length} words` : "no speech detected"}`);
  return { part: getPart(id) };
});
