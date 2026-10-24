export interface TelegramResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

export function telegramConfig() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
  };
}

export const TELEGRAM_CAPTION_LIMIT = 1024;

export function buildCaption(title: string, caption: string, hashtags: string[]) {
  const tags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const text = [title, caption, tags].filter(Boolean).join("\n\n");
  return text.length > TELEGRAM_CAPTION_LIMIT ? `${text.slice(0, TELEGRAM_CAPTION_LIMIT - 1)}…` : text;
}

/** Turns a raw Telegram/network error into a plain-language explanation with a manual next step. */
export function friendlyTelegramError(raw: string): string {
  const e = raw.toLowerCase();
  const rules: [RegExp, string][] = [
    [/chat not found/, "Telegram couldn't find your channel. Next step: Add the bot as an admin to your channel and check the chat ID."],
    [/bot is not a member|need administrator rights|not enough rights|have no rights|bot was kicked/, "The bot isn't allowed to post in this channel. Next step: Make the bot an admin of the channel with permission to post messages, then retry."],
    [/unauthorized|401/, "Telegram rejected the bot token. Next step: Copy the token again from @BotFather and update TELEGRAM_BOT_TOKEN."],
    [/too large|413|entity too large/, "This part is too big for Telegram bots (50 MB limit). Next step: Use a shorter part length and split again."],
    [/too many requests|429|retry after/, "Telegram is rate-limiting the bot. Next step: Wait a minute, then press Retry."],
    [/wrong file|failed to get http url|wrong type|can't parse|video_file_invalid|invalid file/, "Telegram couldn't read this video file. Next step: Split the video again, or download the part and post it by hand."],
    [/not configured|missing/, "Telegram isn't set up yet. Next step: Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to the app secrets and restart the app."],
    [/fetch failed|network|timeout|timed out|econn|enotfound|socket/, "Couldn't reach Telegram (network problem). Next step: Check the internet connection and press Retry."],
  ];
  for (const [re, msg] of rules) if (re.test(e)) return msg;
  return `Telegram didn't accept this part (${raw}). Next step: Press Retry; if it fails again, download the part and post it by hand.`;
}

export async function sendVideo(opts: {
  video: Buffer;
  filename: string;
  caption: string;
}): Promise<TelegramResult> {
  const { token, chatId } = telegramConfig();
  if (!token || !chatId) return { ok: false, error: "Telegram is not configured (missing token or chat id)" };
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", opts.caption);
  form.append("supports_streaming", "true");
  form.append("video", new Blob([new Uint8Array(opts.video)], { type: "video/mp4" }), opts.filename);
  try {
    const res = await fetch(`${process.env.TELEGRAM_API_BASE || "https://api.telegram.org"}/bot${token}/sendVideo`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (json.ok === true && typeof json.result?.message_id === "number") {
      return { ok: true, messageId: json.result.message_id };
    }
    return { ok: false, error: json.description || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
