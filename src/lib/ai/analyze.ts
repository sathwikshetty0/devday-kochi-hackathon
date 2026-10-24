import { formatTime } from "../split-math";
import type { Part, Project } from "../types";
import { structuredChat } from "./nvidia";
import { AnalysisSchema, type Analysis } from "./schemas";

export const NO_SPEECH_REASON = "No speech detected.";
export const NO_SPEECH_MAX_SCORE = 10;

export function buildTimeline(project: Project, parts: Part[]) {
  const header = `Title: ${project.title}\nContent type: ${project.content_type}\nLanguage: ${project.language}\nTotal parts: ${parts.length}`;
  const rows = parts.map((p) => {
    const range = `${formatTime(p.start_seconds)}–${formatTime(p.start_seconds + p.duration_seconds)}`;
    return `Part ${p.part_number} [${range}]: ${p.transcript?.trim() ? p.transcript.trim() : "(no speech)"}`;
  });
  return `${header}\n\nTranscript timeline:\n${rows.join("\n")}`;
}

/** Enforces the no-speech rule and fills in any part the model skipped. */
export function normalizeAnalysis(parts: Part[], analysis: Analysis) {
  const byNumber = new Map(analysis.parts.map((a) => [a.part_number, a]));
  return parts.map((p) => {
    if (!p.transcript?.trim()) {
      return { id: p.id, score: Math.min(byNumber.get(p.part_number)?.score ?? 5, NO_SPEECH_MAX_SCORE, 5), important: false, reason: NO_SPEECH_REASON };
    }
    const a = byNumber.get(p.part_number);
    if (!a) return { id: p.id, score: 30, important: false, reason: "The AI did not rate this part; review it yourself." };
    return { id: p.id, score: Math.round(a.score), important: a.important, reason: a.reason.trim() };
  });
}

export async function analyzeSeries(project: Project, parts: Part[]) {
  const system = `You are an assistant that helps a small video creator decide which short parts of a long ${project.content_type} video matter most.
Rules:
- Use ONLY what is in the transcripts. Never invent events, names, numbers or claims that are not in the transcript.
- Score each part 0-100 for how important or engaging it is for viewers (hooks, reveals, key information, emotional peaks score high).
- Mark roughly the top third as important (at least one part if any part has speech).
- A part marked "(no speech)" must get a score of 10 or lower, important=false and reason "${NO_SPEECH_REASON}".
- Each reason is one short sentence in English that quotes or paraphrases the transcript.
- The summary is 2-3 sentences describing the whole video, using only transcript facts.
- Return exactly one entry per part_number.`;
  const raw = await structuredChat(AnalysisSchema, system, buildTimeline(project, parts));
  return { summary: raw.summary.trim(), results: normalizeAnalysis(parts, raw) };
}
