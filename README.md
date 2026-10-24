# Reelix

**Upload once. Approve once. Reelix handles the rest.**

Reelix turns one long video into numbered short parts, uses AI to transcribe each part and pick the most important ones, lets the creator review and reorder, takes **one** approval for the whole series, and delivers the parts to a Telegram channel with proof (Telegram `message_id`).

Built for Devin Hacks Kochi (Track 1: Kill the Busywork).

## Run locally

Requires Node.js 22.13+ (uses the built-in `node:sqlite`, so nothing native to compile on Windows).

```bash
npm install            # also copies the ffmpeg.wasm core into public/ffmpeg
cp .env.example .env.local   # fill in the secrets below
npm run dev            # http://localhost:3000
```

| Secret | What |
|---|---|
| `NVIDIA_API_KEY` | build.nvidia.com key. Used for speech-to-text (Whisper large v3 via NVIDIA Riva gRPC) and the LLM (`nvidia/nemotron-3.5-super-vl-120b-a12b` by default, with automatic fallback to other NVIDIA models when one is slow or unavailable; set `NVIDIA_LLM_MODEL` to change). |
| `TELEGRAM_BOT_TOKEN` | From @BotFather. |
| `TELEGRAM_CHAT_ID` | Your channel, e.g. `@mychannel` or `-100…`. Add the bot as a channel admin. |

Data (SQLite db + uploaded parts) lives in `./data` (`DATA_DIR` to change).

## How it works

- **Splitting runs in the browser** with ffmpeg.wasm (single-thread core, loaded on demand, so no COOP/COEP headers). Each part is re-encoded for exact cuts (libx264 ultrafast, ≤720p, AAC, +faststart) at a bitrate that keeps it under 20 MB, then uploaded. The original video never leaves the device.
- **AI analysis**: the server extracts audio from each part (ffmpeg-static) and transcribes it with NVIDIA Whisper. The transcript timeline goes to the LLM, which returns `{summary, parts:[{part_number, score, important, reason}]}`. That JSON is checked with zod. Parts with no speech always get a low score and "No speech detected."
- **AI captions**: one button writes a series title plus a caption and 3–5 hashtags per part, in the project language. You can edit all of it.
- **Delivery**: `POST /api/parts/:id/deliver` (`src/lib/deliver.ts`). It is idempotent and locks the part atomically. If you pressed Stop, the part is cancelled. Simulate failure fails one part on its first try. The part only counts as delivered when Telegram returns `ok: true` with a `message_id`. Each step is written to the activity log. The browser sends parts one at a time and checks for Stop between them.
- **Export**: a zip of `part_01.mp4 …` plus `captions.csv`.

## Scripts

`npm run dev` · `npm run build` · `npm test` · `npm run lint` · `npm run typecheck`

## Deploying to Vercel (later)

Vercel functions have no persistent disk and limit request bodies to about 4.5 MB. Before deploying there, move `src/lib/db.ts` to Postgres and `src/lib/storage.ts` to Vercel Blob (with client-side uploads).
