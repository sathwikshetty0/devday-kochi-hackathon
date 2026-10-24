import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { HttpError, bundle, handle, requireProject, type Ctx } from "@/lib/api";
import { db, getParts, renumberParts, updatePart } from "@/lib/db";

export const runtime = "nodejs";

export const POST = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  if (!["review", "awaiting_approval", "draft", "splitting"].includes(project.status)) throw new HttpError(409, "The series is locked after approval.");
  const { ids } = z.object({ ids: z.array(z.string()) }).parse(await req.json());
  const current = getParts(id);
  if (ids.length !== current.length || !current.every((p) => ids.includes(p.id))) throw new HttpError(400, "Part list is out of date. Refresh and try again.");
  db().transaction(() => ids.forEach((pid, i) => updatePart(pid, { order: i + 1 })))();
  renumberParts(id, project.title);
  logActivity(id, null, "Parts reordered");
  return bundle(id);
});
