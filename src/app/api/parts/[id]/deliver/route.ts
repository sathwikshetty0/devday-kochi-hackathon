import { HttpError, handle, type Ctx } from "@/lib/api";
import { getPart } from "@/lib/db";
import { deliverPart } from "@/lib/deliver";

export const runtime = "nodejs";
export const maxDuration = 180;

export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  if (!getPart(id)) throw new HttpError(404, "Part not found");
  return deliverPart(id);
});
