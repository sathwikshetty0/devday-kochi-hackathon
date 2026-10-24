import { bundle, handle, type Ctx } from "@/lib/api";
import { stopProject } from "@/lib/deliver";

export const runtime = "nodejs";

export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  stopProject(id);
  return bundle(id);
});
