export interface PlannedPart {
  part_number: number;
  start: number;
  duration: number;
}

export const MAX_PART_BYTES = 20 * 1024 * 1024;
export const AUDIO_KBPS = 96;

/**
 * Plans the parts. With `even` on, the video is cut into the fewest parts that are each at most
 * `maxLength` long, all the same length (80 s at 60 s max = 2 x 40 s; 60 s or less = 1 part).
 * With `even` off, every part is exactly `maxLength` and the last one keeps the remainder.
 */
export function planParts(totalSeconds: number, maxLength: number, even = true): PlannedPart[] {
  if (!(totalSeconds > 0) || !(maxLength > 0)) return [];
  if (even) return splitRange(0, totalSeconds, maxLength).map((r, i) => ({ part_number: i + 1, ...r }));
  const parts: PlannedPart[] = [];
  for (let start = 0; start < totalSeconds - 0.05; start += maxLength) {
    parts.push({ part_number: parts.length + 1, start, duration: Math.min(maxLength, totalSeconds - start) });
  }
  return parts;
}

/** Splits [start, start+duration) into the fewest equal pieces no longer than maxLength. */
export function splitRange(start: number, duration: number, maxLength: number) {
  const n = Math.max(1, Math.ceil((duration - 0.05) / maxLength));
  const each = duration / n;
  return Array.from({ length: n }, (_, i) => ({ start: start + i * each, duration: each }));
}

/**
 * Cuts audio into windows of minSec..maxSec, ending each window at the quietest frame
 * so speech isn't chopped mid-word. `frames` holds one loudness value per `frameSec`.
 */
export function silenceWindows(frames: number[], frameSec: number, minSec: number, maxSec: number) {
  const total = frames.length * frameSec;
  const windows: { start: number; end: number }[] = [];
  let pos = 0;
  while (total - pos > maxSec) {
    const from = Math.ceil((pos + minSec) / frameSec);
    const to = Math.min(frames.length - 1, Math.floor((pos + maxSec) / frameSec));
    let best = to;
    for (let i = to; i >= from; i--) if (frames[i] < frames[best]) best = i;
    const cut = (best + 0.5) * frameSec;
    windows.push({ start: pos, end: cut });
    pos = cut;
  }
  if (total - pos > 0.05) {
    const last = windows[windows.length - 1];
    if (last && total - pos < minSec / 2) last.end = total;
    else windows.push({ start: pos, end: total });
  }
  return windows;
}

/** Video bitrate (kbps) that keeps a part of `durationSeconds` under 20 MB with ~10% headroom. */
export function videoBitrateKbps(durationSeconds: number) {
  const budgetKbits = (MAX_PART_BYTES * 8 * 0.9) / 1000;
  const kbps = Math.floor(budgetKbits / Math.max(durationSeconds, 1)) - AUDIO_KBPS;
  return Math.max(200, Math.min(2500, kbps));
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function formatDurationWords(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m} min ${s} sec` : `${m} min`;
}
