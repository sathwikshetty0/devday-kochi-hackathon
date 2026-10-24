# Reelix

**Upload once. Approve once. Reelix handles the rest.**

Reelix turns one long video into numbered short parts, uses AI to transcribe each part and pick the most important moments, lets the creator review and reorder with drag-and-drop, takes **one** approval for the whole series, and automatically delivers parts to **Telegram**, **YouTube Shorts**, or **Instagram Reels** with verified proof.

Built for **Devin Hacks Kochi (Track 1: Kill the Busywork)**.

---

## Run locally

Requires Node.js 22.13+ (uses built-in `node:sqlite`, so nothing native to compile on Windows).

```bash
npm install                  # copies ffmpeg.wasm core into public/ffmpeg
npx playwright install chromium  # browser automation engine
cp .env.example .env.local         # fill in the secrets below
npm run dev                  # http://localhost:3000
```

| Secret / Config | What |
|---|---|
| `NVIDIA_API_KEY` | build.nvidia.com key. Used for speech-to-text (Whisper large v3 via NVIDIA Riva gRPC) and LLM analysis (`nvidia/nemotron-3.5-super-vl-120b-a12b` by default, with automatic fallback models). |
| `TELEGRAM_BOT_TOKEN` | (Optional) From @BotFather for Telegram delivery. |
| `TELEGRAM_CHAT_ID` | (Optional) Target channel, e.g. `@mychannel` or `-100…`. |
| `CHROME_CDP_URL` | (Optional) e.g. `http://127.0.0.1:9222` to hook directly into your active Chrome session. |
| `MOCK_SOCIAL_POSTING` | (Optional) Set to `"true"` for mock social delivery testing without opening a browser. |

Data (SQLite db, browser profiles, and local video parts) lives in `./data` (`DATA_DIR` to change).

---

## How it works

1. **Client-Side Splitting with ffmpeg.wasm**:
   - Splitting runs directly in the browser via single-thread WebAssembly core.
   - Each part is re-encoded for exact cuts (`libx264 ultrafast`, `≤720p`, `AAC`, `+faststart`) to keep parts lightweight.
   - The original raw video never leaves your device.

2. **AI Timeline & Importance Analysis**:
   - Server extracts audio from parts with `ffmpeg-static` and transcribes using NVIDIA Whisper.
   - Full transcript timelines are fed into the NVIDIA LLM, which scores each part's virality/importance (`{score, important, reason}`) and generates structured summaries.

3. **AI Captions & Hashtags**:
   - Generate cohesive series titles, tailored descriptions, and 3–5 viral hashtags per part in your target language with one click.

4. **Multi-Channel Delivery with Proof**:
   - **Telegram Channel**: Direct bot API delivery returning verified `message_id` proof.
   - **YouTube Shorts (Desktop Browser Bot)**: Automates upload into YouTube Studio, sets titles with `#Shorts`, descriptions, enforces "No, it's not made for kids", sets Public visibility, and captures the live `youtu.be` link as proof.
   - **Instagram Reels (Desktop Browser Bot)**: Automates upload into Instagram Web with aspect ratio formatting and captures the post permalink.
   - **Session Persistence**: Stored in `./data/browser-profile` so you sign in once and all future uploads run automatically.

5. **Safety, Idempotency & Control**:
   - Atomic SQLite locks prevent double-posting.
   - Stop button instantly cancels pending deliveries.
   - "Simulate failure" mode to test automatic error handling and one-click manual retry.
   - Complete live activity log for every action.

6. **Export**:
   - One-click zip download containing all split `.mp4` parts alongside `captions.csv`.

---

## Scripts

- `npm run dev`: Start Next.js development server
- `npm run build`: Production build
- `npm test`: Run Vitest test suite
- `npm run typecheck`: TypeScript verification
- `npm run lint`: ESLint check
