import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { HttpError, bundle, handle, requireProject, type Ctx } from "@/lib/api";
import { db, getParts, updatePart, updateProject } from "@/lib/db";
import { telegramConfig } from "@/lib/telegram";
import { SKIPPED_NOT_IMPORTANT } from "@/lib/deliver";

export const runtime = "nodejs";

/** The single explicit approval for the whole series. Nothing is delivered before this. */
export const POST = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  if (project.status !== "awaiting_approval") throw new HttpError(409, `This series can't be approved while it is "${project.status}".`);
  const { send_important_only } = z.object({ send_important_only: z.boolean() }).parse(await req.json());
  const { token, chatId } = telegramConfig();
  if (!token || !chatId) throw new HttpError(400, "Telegram isn't set up yet. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to the app secrets and restart.");
  const parts = getParts(id).filter((p) => ["queued", "awaiting_approval"].includes(p.status));
  const toSend = send_important_only ? parts.filter((p) => p.ai_important) : parts;
  if (!toSend.length) throw new HttpError(400, "No parts are marked important. Mark at least one part or turn off \"Send only important parts\".");
  db().transaction(() => {
    for (const p of parts) {
      if (toSend.includes(p)) updatePart(p.id, { status: "approved", error_message: null });
      else updatePart(p.id, { status: "cancelled", error_message: SKIPPED_NOT_IMPORTANT });
    }
    updateProject(id, { status: "delivering", send_important_only });
  })();
  logActivity(id, null, "Series approved", `${toSend.length} part(s) approved for Telegram${parts.length - toSend.length ? `, ${parts.length - toSend.length} skipped (not important)` : ""}`);
  return bundle(id);
});
