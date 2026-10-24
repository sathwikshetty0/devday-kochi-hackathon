import { z } from "zod";
import { handle } from "@/lib/api";
import { db, getSetting, setSetting } from "@/lib/db";
import { telegramConfig } from "@/lib/telegram";

export const runtime = "nodejs";

function current() {
  const { token, chatId } = telegramConfig();
  return {
    simulate_failure: getSetting("simulate_failure", "0") === "1",
    integrations: {
      nvidia: !!process.env.NVIDIA_API_KEY,
      telegram_token: !!token,
      telegram_chat: !!chatId,
    },
  };
}

export const GET = handle(async () => current());

export const PATCH = handle(async (req: Request) => {
  const { simulate_failure } = z.object({ simulate_failure: z.boolean() }).parse(await req.json());
  setSetting("simulate_failure", simulate_failure ? "1" : "0");
  // Apply to every series that hasn't been sent yet.
  db()
    .prepare("UPDATE projects SET simulate_failure = ? WHERE status IN ('draft','splitting','review','awaiting_approval')")
    .run(simulate_failure ? 1 : 0);
  return current();
});
