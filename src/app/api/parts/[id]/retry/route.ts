import { logActivity } from "@/lib/activity";
import { HttpError, handle, requireProject, type Ctx } from "@/lib/api";
import { db, getPart, updateProject } from "@/lib/db";
import { deliverPart } from "@/lib/deliver";

export const runtime = "nodejs";
export const maxDuration = 180;

export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const part = getPart(id);
  if (!part) throw new HttpError(404, "Part not found");
  const project = requireProject(part.project_id);
  if (project.status === "stopped") throw new HttpError(409, "This series was stopped. Nothing more will be sent.");
  const res = db().prepare("UPDATE parts SET status = 'approved' WHERE id = ? AND status = 'failed'").run(id);
  if (res.changes === 0) throw new HttpError(409, "Only failed parts can be retried.");
  updateProject(project.id, { status: "delivering" });
  logActivity(project.id, id, "Retry requested", `Part ${part.part_number}/${part.total_parts}`);
  return deliverPart(id);
});
