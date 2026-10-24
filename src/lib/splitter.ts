"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { MAX_PART_BYTES, AUDIO_KBPS, videoBitrateKbps, type PlannedPart } from "./split-math";

let ffmpegPromise: Promise<FFmpeg> | null = null;
let logListener: ((msg: string) => void) | null = null;

/** Loads the single-thread ffmpeg.wasm core on demand (no COOP/COEP headers needed). */
export function loadFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
      const ff = new FFmpeg();
      ff.on("log", ({ message }) => logListener?.(message));
      const base = `${window.location.origin}/ffmpeg`;
      await ff.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ff;
    })().catch((err) => {
      ffmpegPromise = null;
      throw err;
    });
  }
  return ffmpegPromise;
}

export function browserDuration(file: File, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (d: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(d);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

function parseClock(s: string) {
  const [h, m, sec] = s.split(":").map(Number);
  return h * 3600 + m * 60 + sec;
}

export interface MountedInput {
  path: string;
  cleanup: () => Promise<void>;
}

export async function mountInput(ff: FFmpeg, file: File): Promise<MountedInput> {
  const dir = "/input";
  try {
    const { FFFSType } = await import("@ffmpeg/ffmpeg");
    await ff.createDir(dir).catch(() => {});
    await ff.mount(FFFSType.WORKERFS, { files: [file] }, dir);
    return { path: `${dir}/${file.name}`, cleanup: async () => void (await ff.unmount(dir).catch(() => {})) };
  } catch {
    const { fetchFile } = await import("@ffmpeg/util");
    const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] || ".mp4";
    const path = `/source${ext}`;
    await ff.writeFile(path, await fetchFile(file));
    return { path, cleanup: async () => void (await ff.deleteFile(path).catch(() => {})) };
  }
}

/** Fallback when the browser can't read the length: ask ffmpeg (it prints "Duration: hh:mm:ss.xx"). */
export async function ffmpegDuration(ff: FFmpeg, inputPath: string): Promise<number | null> {
  let found: number | null = null;
  logListener = (m) => {
    const match = m.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);
    if (match) found = parseClock(match[1]);
  };
  await ff.exec(["-hide_banner", "-i", inputPath]).catch(() => {});
  logListener = null;
  return found;
}

let fontLoaded = false;
async function ensureFont(ff: FFmpeg) {
  if (fontLoaded) return;
  const res = await fetch("/fonts/badge.ttf");
  await ff.writeFile("/badge.ttf", new Uint8Array(await res.arrayBuffer()));
  fontLoaded = true;
}

export interface EncodeOptions {
  crop916: boolean;
  badge: boolean;
}

function videoFilter(opts: EncodeOptions, part: PlannedPart, total: number, withBadge: boolean) {
  const filters = opts.crop916
    ? ["crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'", "scale=-2:'min(1280,ih)'"]
    : ["scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'"];
  if (withBadge) {
    filters.push(
      `drawtext=fontfile=/badge.ttf:text='Part ${part.part_number}/${total}':fontcolor=white:fontsize=h/22:box=1:boxcolor=black@0.55:boxborderw=14:x=w-tw-28:y=28`,
    );
  }
  filters.push("format=yuv420p");
  return filters.join(",");
}

/** Re-encodes one exact-length part (libx264 ultrafast, ≤720p, AAC, +faststart) kept under 20 MB. */
export async function encodePart(
  ff: FFmpeg,
  inputPath: string,
  part: PlannedPart,
  total: number,
  opts: EncodeOptions,
  onProgress: (ratio: number) => void,
): Promise<Uint8Array> {
  let withBadge = opts.badge;
  if (withBadge) await ensureFont(ff).catch(() => (withBadge = false));
  let kbps = videoBitrateKbps(part.duration);
  const out = `/part_${part.part_number}.mp4`;
  for (let attempt = 0; attempt < 3; attempt++) {
    logListener = (m) => {
      const t = m.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/);
      if (t) onProgress(Math.min(0.99, parseClock(t[1]) / part.duration));
    };
    const args = [
      "-hide_banner", "-y",
      "-ss", part.start.toFixed(3), "-i", inputPath, "-t", part.duration.toFixed(3),
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", videoFilter(opts, part, total, withBadge),
      "-c:v", "libx264", "-preset", "ultrafast",
      "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`,
      "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-ac", "2",
      "-movflags", "+faststart",
      out,
    ];
    const code = await ff.exec(args);
    logListener = null;
    if (code !== 0) {
      if (withBadge) {
        withBadge = false; // drawtext unavailable in this core: continue without the badge
        continue;
      }
      throw new Error(`Couldn't cut part ${part.part_number}. The video format may not be supported; try an MP4 (H.264) file.`);
    }
    const data = (await ff.readFile(out)) as Uint8Array;
    await ff.deleteFile(out).catch(() => {});
    if (data.byteLength <= MAX_PART_BYTES) {
      onProgress(1);
      return data;
    }
    kbps = Math.max(150, Math.floor(kbps * 0.7));
  }
  throw new Error(`Part ${part.part_number} is still over 20 MB. Choose a shorter part length.`);
}

/** Pulls a small mono 16 kHz AAC track out of the video for full-length transcription. */
export async function extractAudio(ff: FFmpeg, inputPath: string, duration: number, onProgress: (ratio: number) => void): Promise<Uint8Array> {
  const out = "/audio.m4a";
  logListener = (m) => {
    const t = m.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/);
    if (t) onProgress(Math.min(0.99, parseClock(t[1]) / duration));
  };
  const code = await ff.exec(["-hide_banner", "-y", "-i", inputPath, "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", out]);
  logListener = null;
  if (code !== 0) throw new Error("Couldn't read the audio from this video. It may have no sound track; use Even parts instead.");
  const data = (await ff.readFile(out)) as Uint8Array;
  await ff.deleteFile(out).catch(() => {});
  onProgress(1);
  return data;
}
