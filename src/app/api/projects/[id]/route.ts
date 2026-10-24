import { z } from "zod";
import { HttpError, bundle, handle, requireProject, type Ctx } from "@/lib/api";
import { db, renumberParts, updateProject } from "@/lib/db";
import { deleteDir } from "@/lib/storage";
import { CONTENT_TYPES, LANGUAGES, ASPECT_RATIOS } from "@/lib/types";

export const runtime = "nodejs";

// Status changes go through dedicated endpoints; delivery state is server-only.
const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    content_type: z.enum(CONTENT_TYPES),
    language: z.enum(LANGUAGES),
    part_length_seconds: z.number().int().min(5).max(600),
    merge_short_last: z.boolean(),
    split_mode: z.enum(["even", "ai"]),
    add_part_badge: z.boolean(),
    crop_9_16: z.boolean(),
    aspect_ratio: z.enum(ASPECT_RATIOS),
    delivery_channel: z.enum(["telegram", "instagram", "youtube"]),
    simulate_failure: z.boolean(),
    send_important_only: z.boolean(),
  })
  .partial()
  .strict();

export const GET = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => bundle((await params).id));

export const PATCH = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || "Invalid update");
  updateProject(id, parsed.data);
  if (parsed.data.title && parsed.data.title !== project.title) renumberParts(id, parsed.data.title);
  return bundle(id);
});

export const DELETE = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  requireProject(id);
  db().prepare("DELETE FROM projects WHERE id = ?").run(id);
  await deleteDir(`projects/${id}`);
  return { ok: true };
});
