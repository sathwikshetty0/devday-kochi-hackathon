import { randomUUID } from "node:crypto";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { HttpError, handle } from "@/lib/api";
import { getSetting, insertProject, listProjects } from "@/lib/db";
import { CONTENT_TYPES, LANGUAGES, type Project } from "@/lib/types";

export const runtime = "nodejs";

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  content_type: z.enum(CONTENT_TYPES),
  language: z.enum(LANGUAGES),
  rights_confirmed: z.literal(true, { message: "Please confirm you own this video or have permission to use it." }),
});

export const GET = handle(async () => ({ projects: listProjects() }));

export const POST = handle(async (req: Request) => {
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || "Invalid project");
  const project: Project = {
    id: randomUUID(),
    ...parsed.data,
    original_video_url: null,
    part_length_seconds: 60,
    merge_short_last: true,
    split_mode: "ai",
    add_part_badge: true,
    crop_9_16: false,
    simulate_failure: getSetting("simulate_failure", "0") === "1",
    failure_simulated: false,
    send_important_only: false,
    status: "draft",
    ai_summary: null,
    created_date: new Date().toISOString(),
  };
  insertProject(project);
  logActivity(project.id, null, "Project created", `${project.title} (${project.content_type}, ${project.language})`);
  return { project };
});
