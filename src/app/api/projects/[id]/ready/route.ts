import { logActivity } from "@/lib/activity";
import { HttpError, bundle, handle, requireProject, type Ctx } from "@/lib/api";
import { db, getParts, updateProject } from "@/lib/db";

export const runtime = "nodejs";

/** Moves a reviewed series to the approval step. */
export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  if (!["review", "awaiting_approval"].includes(project.status)) throw new HttpError(409, `Can't move to approval from "${project.status}".`);
  if (!getParts(id).length) throw new HttpError(400, "There are no parts to approve.");
  db().prepare("UPDATE parts SET status = 'awaiting_approval' WHERE project_id = ? AND status = 'queued'").run(id);
  if (project.status !== "awaiting_approval") {
    updateProject(id, { status: "awaiting_approval" });
    logActivity(id, null, "Ready for approval");
  }
  return bundle(id);
});
