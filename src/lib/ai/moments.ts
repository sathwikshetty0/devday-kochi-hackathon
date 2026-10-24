import { formatTime, splitRange } from "../split-math";
import type { Project } from "../types";
import { structuredChat } from "./nvidia";
import { MomentsSchema, type Moments } from "./schemas";

export interface Segment {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface Moment {
  start: number;
  duration: number;
  title: string;
  score: number;
  important: boolean;
  reason: string;
  transcript: string;
}

export function segmentsText(segments: Segment[]) {
  return segments
    .map((s) => `[${s.index}] ${formatTime(s.start)}-${formatTime(s.end)}: ${s.text.trim() || "(no speech)"}`)
    .join("\n");
}

/** Turns the model's segment ranges into non-overlapping cuts no longer than maxLength. */
export function normalizeMoments(segments: Segment[], raw: Moments, maxLength: number): Moment[] {
  const last = segments.length - 1;
  const ranges = raw.moments
    .map((m) => ({ ...m, s: Math.max(0, Math.min(m.start_segment, m.end_segment)), e: Math.min(last, Math.max(m.start_segment, m.end_segment)) }))
    .filter((m) => m.s <= last && m.e >= 0)
    .sort((a, b) => a.s - b.s);
  const picked: typeof ranges = [];
  for (const r of ranges) {
    const prev = picked[picked.length - 1];
    if (prev && r.s <= prev.e) {
      if (r.e <= prev.e) continue; // fully inside the previous moment
      r.s = prev.e + 1;
    }
    picked.push(r);
  }
  return picked.flatMap((m) => {
    const start = segments[m.s].start;
    const end = segments[m.e].end;
    const pieces = splitRange(start, end - start, maxLength);
    return pieces.map((p, i) => {
      const text = segments
        .filter((s) => s.end > p.start + 0.05 && s.start < p.start + p.duration - 0.05)
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join(" ");
      return {
        start: p.start,
        duration: p.duration,
        title: pieces.length > 1 ? `${m.title.trim()} (${i + 1}/${pieces.length})` : m.title.trim(),
        score: Math.round(m.score),
        important: m.important,
        reason: m.reason.trim(),
        transcript: text,
      };
    });
  });
}

export async function pickMoments(project: Project, segments: Segment[], maxLength: number) {
  const total = segments[segments.length - 1]?.end ?? 0;
  const system = `You help a small creator turn a long ${project.content_type} video into short parts made only of its important, high-priority moments.
You get a transcript timeline split into numbered segments with times.
Rules:
- Use ONLY what is in the transcript. Never invent anything.
- Pick the moments worth posting: hooks, key information, reveals, punchlines, emotional peaks, and the conclusion. Skip filler, repetition, silence and off-topic chatter.
- Each moment is a contiguous range of segments: start_segment..end_segment (inclusive). Moments must not overlap and must be in time order.
- Aim for moments between 15 and ${maxLength} seconds long. A longer moment will be cut into equal parts automatically, so keep complete thoughts together.
- If the whole video is important and short, one moment covering everything is fine.
- score 0-100 for how important/engaging the moment is; important=true for the strongest ones (at least one).
- title: 2-5 words naming the moment. reason: one short English sentence that paraphrases the transcript.
- summary: 2-3 sentences describing the whole video using only transcript facts.`;
  const user = `Title: ${project.title}\nLanguage: ${project.language}\nVideo length: ${formatTime(total)}\nMax part length: ${maxLength} seconds\n\nSegments:\n${segmentsText(segments)}`;
  const raw = await structuredChat(MomentsSchema, system, user);
  const moments = normalizeMoments(segments, raw, maxLength);
  if (!moments.length) throw new Error("The AI didn't find any moments to cut. Try Even parts instead.");
  return { summary: raw.summary.trim(), moments };
}
