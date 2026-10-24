import { logActivity } from "@/lib/activity";
import { HttpError, bundle, handle, requireProject, type Ctx } from "@/lib/api";
import { updateProject } from "@/lib/db";
import { pickMoments } from "@/lib/ai/moments";
import { transcribeTimeline } from "@/lib/ai/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;

/**
 * AI-first mode: receives the full audio track (multipart: audio, max_length, clip_count?), transcribes it as a
 * timeline, and asks the AI which important moments to cut. Nothing is cut here.
 */
export const POST = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  if (!["draft", "splitting", "review"].includes(project.status)) throw new HttpError(409, "The series is locked after approval.");
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || !audio.size) throw new HttpError(400, "Missing audio");
  if (audio.size > MAX_AUDIO_BYTES) throw new HttpError(400, "The audio is too long. Try a shorter video.");
  const countRaw = Number(form.get("clip_count"));
  const clipCount = Number.isInteger(countRaw) && countRaw > 0 ? Math.min(50, countRaw) : undefined;
  const maxLength = Math.max(5, Math.min(600, Math.round(Number(form.get("max_length")) || project.part_length_seconds)));

  logActivity(id, null, "AI timeline started", "Transcribing the full video");
  const t0 = Date.now();
  const secs = (from: number) => `${Math.round((Date.now() - from) / 1000)}s`;
  const segments = await transcribeTimeline(Buffer.from(await audio.arrayBuffer()), project.language);
  updateProject(id, { timeline: JSON.stringify(segments), split_mode: "ai", part_length_seconds: maxLength });
  if (!segments.some((s) => s.text.trim())) {
    logActivity(id, null, "AI timeline", "No speech detected");
    throw new HttpError(400, "No speech detected in this video, so the AI can't pick moments. Use Even parts instead.");
  }
  logActivity(id, null, "Transcript timeline ready", `${segments.length} segments in ${secs(t0)}`);
  const t1 = Date.now();

  const { summary, moments } = await pickMoments(project, segments, maxLength, clipCount);
  updateProject(id, { ai_plan: JSON.stringify(moments), ai_summary: summary });
  logActivity(id, null, "AI picked important moments", `${moments.length} parts, ${moments.filter((m) => m.important).length} marked important (${secs(t1)})`);
  return bundle(id);
});
