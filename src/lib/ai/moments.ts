import { formatTime, splitRange } from "../split-math";
import type { Project } from "../types";
import { enforceImportance, KEEP_MIN_SCORE } from "./importance";
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

type RawMoment = Moments["moments"][number];
type Range = RawMoment & { s: number; e: number };

function textBetween(segments: Segment[], start: number, end: number) {
  return segments
    .filter((s) => s.end > start + 0.05 && s.start < end - 0.05)
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Valid, time-ordered, non-overlapping segment ranges. When two ranges overlap, the higher-scored
 * one wins and the other is dropped (trimming it would make its title describe the wrong words).
 */
function cleanRanges(segments: Segment[], raw: RawMoment[]): Range[] {
  const last = segments.length - 1;
  const ranges = raw
    .map((m) => ({ ...m, s: Math.max(0, Math.min(m.start_segment, m.end_segment)), e: Math.min(last, Math.max(m.start_segment, m.end_segment)) }))
    .filter((m) => m.s <= last && m.e >= 0)
    .sort((a, b) => b.score - a.score);
  const picked: Range[] = [];
  for (const r of ranges) if (!picked.some((p) => r.s <= p.e && r.e >= p.s)) picked.push(r);
  return picked.sort((a, b) => a.s - b.s);
}

function toMoment(segments: Segment[], m: Range, start: number, end: number, title = m.title.trim()): Moment {
  return {
    start,
    duration: end - start,
    title,
    score: Math.round(m.score),
    important: m.important,
    reason: m.reason.trim(),
    transcript: textBetween(segments, start, end),
  };
}

/**
 * Turns the model's segment ranges into cuts no longer than maxLength.
 * Without a count: weak moments are dropped and long ones are split into equal pieces.
 * With a count: each moment becomes exactly one clip (trimmed to maxLength from its start),
 * and the `count` strongest are kept, in time order.
 */
export function normalizeMoments(segments: Segment[], raw: Moments, maxLength: number, count?: number): Moment[] {
  const ranges = cleanRanges(segments, raw.moments);
  if (count) {
    const clips = ranges.map((m) => {
      const start = segments[m.s].start;
      let end = segments[m.e].end;
      if (end - start > maxLength) {
        // Stop at the last segment boundary that fits, or hard-cut a single long segment.
        const fit = segments.slice(m.s, m.e + 1).filter((s) => s.end - start <= maxLength).pop();
        end = fit ? fit.end : start + maxLength;
      }
      return toMoment(segments, m, start, end);
    });
    const best = [...clips].sort((a, b) => b.score - a.score).slice(0, count);
    return enforceImportance(best.sort((a, b) => a.start - b.start));
  }
  const strong = ranges.filter((m) => m.score >= KEEP_MIN_SCORE);
  const kept = strong.length ? strong : [...ranges].sort((a, b) => b.score - a.score).slice(0, 1);
  const pieces = kept.flatMap((m) => {
    const start = segments[m.s].start;
    const parts = splitRange(start, segments[m.e].end - start, maxLength);
    return parts.map((p, i) =>
      toMoment(segments, m, p.start, p.start + p.duration, parts.length > 1 ? `${m.title.trim()} (${i + 1}/${parts.length})` : m.title.trim()),
    );
  });
  return enforceImportance(pieces);
}

function systemPrompt(project: Project, maxLength: number, count?: number) {
  return `You help a small creator turn a long ${project.content_type} video into short clips made only of its strongest moments.
You get a transcript timeline split into numbered segments with times.
Rules:
- Use ONLY what is in the transcript. Never invent anything.
- Only pick moments a viewer would stop scrolling for:
  * hooks (a strong opening line, a bold claim, a "wait for it" setup),
  * questions that create curiosity, and the moment they are answered,
  * key information, reveals, punchlines and emotional peaks.
- Do NOT pick greetings, intros like "welcome to my channel", outros, "like and subscribe", thank-yous, recaps, filler, repetition, silence or off-topic chatter.
- Each moment is a contiguous range of segments: start_segment..end_segment (inclusive). Moments must not overlap or share any segment.
- Double-check the numbers: the segments you give must contain exactly the words your title and reason describe.
- ${count
    ? `Return exactly ${count} moments (fewer only if the video truly doesn't have that many distinct moments). Spread them across the whole video, not just the start. Each moment must be one complete thought of 10 to ${maxLength} seconds.`
    : `Usually this is well under half of the video. Aim for moments between 15 and ${maxLength} seconds; a longer moment will be cut into equal parts automatically.`}
- score 0-100 for how strong the moment is: 85+ only for real hooks/reveals, 50-70 for useful but ordinary content.
- important=true only for the strongest hooks or key moments, never for everything.
- title: 2-5 words naming the moment. reason: one short English sentence that paraphrases the transcript.
- summary: 2-3 sentences describing the whole video using only transcript facts.`;
}

export async function pickMoments(project: Project, segments: Segment[], maxLength: number, count?: number) {
  const total = segments[segments.length - 1]?.end ?? 0;
  const header = `Title: ${project.title}\nLanguage: ${project.language}\nVideo length: ${formatTime(total)}\nMax clip length: ${maxLength} seconds${count ? `\nNumber of clips wanted: ${count}` : ""}`;
  const timeline = segmentsText(segments);
  const raw = await structuredChat(MomentsSchema, systemPrompt(project, maxLength, count), `${header}\n\nSegments:\n${timeline}`);
  let all = raw.moments;
  // One follow-up if the model returned too few: ask for the rest, avoiding what's already picked.
  if (count && cleanRanges(segments, all).length < count && segments.length > cleanRanges(segments, all).length) {
    const taken = cleanRanges(segments, all).map((m) => `${m.s}-${m.e}`).join(", ") || "none";
    const missing = count - cleanRanges(segments, all).length;
    const more = await structuredChat(
      MomentsSchema,
      systemPrompt(project, maxLength, missing),
      `${header}\n\nAlready picked segment ranges (do not reuse or overlap these): ${taken}\nPick ${missing} more moments.\n\nSegments:\n${timeline}`,
    ).catch(() => null);
    if (more) all = [...all, ...more.moments];
  }
  const moments = normalizeMoments(segments, { ...raw, moments: all }, maxLength, count);
  if (!moments.length) throw new Error("The AI didn't find any moments to cut. Try Even parts instead.");
  return { summary: raw.summary.trim(), moments };
}
