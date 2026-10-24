import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { HttpError, handle, requireProject, type Ctx } from "@/lib/api";
import { db, getPart, renumberParts, updatePart } from "@/lib/db";
import { deleteByUrl } from "@/lib/storage";

export const runtime = "nodejs";

// Only creator-editable fields. status / delivery_proof can never be set from the browser.
const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    caption: z.string().max(900),
    hashtags: z.array(z.string().trim().min(1).max(60)).max(10),
    ai_important: z.boolean(),
  })
  .partial()
  .strict();

const EDITABLE = ["queued", "awaiting_approval"];

function editablePart(id: string) {
  const part = getPart(id);
  if (!part) throw new HttpError(404, "Part not found");
  if (!EDITABLE.includes(part.status)) throw new HttpError(409, "This part has already been approved and can't be edited.");
  return part;
}

export const PATCH = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const part = editablePart(id);
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || "Invalid update");
  const data = { ...parsed.data };
  if (data.hashtags) data.hashtags = data.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`));
  updatePart(id, data);
  if (data.ai_important !== undefined && data.ai_important !== part.ai_important) {
    logActivity(part.project_id, id, "Importance changed", `Part ${part.part_number} marked ${data.ai_important ? "important" : "not important"} by you`);
  }
  return { part: getPart(id) };
});

export const DELETE = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const part = editablePart(id);
  const project = requireProject(part.project_id);
  db().prepare("DELETE FROM parts WHERE id = ?").run(id);
  await deleteByUrl(part.video_url);
  renumberParts(project.id, project.title);
  logActivity(project.id, null, "Part removed", `Removed "${part.title}"`);
  return { ok: true };
});
