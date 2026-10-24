export interface PlannedPart {
  part_number: number;
  start: number;
  duration: number;
}

export const MAX_PART_BYTES = 20 * 1024 * 1024;
export const AUDIO_KBPS = 96;

/** A last part shorter than this fraction of the part length counts as "very short". */
export const SHORT_LAST_FRACTION = 1 / 3;

export function planParts(totalSeconds: number, partLength: number, mergeShortLast: boolean): PlannedPart[] {
  if (!(totalSeconds > 0) || !(partLength > 0)) return [];
  const parts: PlannedPart[] = [];
  for (let start = 0; start < totalSeconds - 0.05; start += partLength) {
    parts.push({ part_number: parts.length + 1, start, duration: Math.min(partLength, totalSeconds - start) });
  }
  const last = parts[parts.length - 1];
  if (mergeShortLast && parts.length > 1 && last.duration < partLength * SHORT_LAST_FRACTION) {
    parts.pop();
    parts[parts.length - 1].duration += last.duration;
  }
  return parts;
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
