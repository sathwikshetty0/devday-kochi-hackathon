import type { Part, Project } from "../types";
import { structuredChat } from "./nvidia";
import { CaptionsSchema, type Captions } from "./schemas";

export function normalizeHashtag(tag: string) {
  const cleaned = tag.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return cleaned ? `#${cleaned}` : "";
}

export function normalizeCaptions(parts: Part[], captions: Captions) {
  const byNumber = new Map(captions.parts.map((c) => [c.part_number, c]));
  return parts.map((p) => {
    const c = byNumber.get(p.part_number);
    return {
      id: p.id,
      caption: c?.caption.trim() ?? p.caption,
      hashtags: c ? Array.from(new Set(c.hashtags.map(normalizeHashtag).filter(Boolean))).slice(0, 5) : p.hashtags,
    };
  });
}

const BATCH_SIZE = 6;

async function captionBatch(project: Project, parts: Part[], totalParts: number) {
  const system = `You write short social media captions for a numbered video series by a small creator.
Rules:
- Write every caption and hashtag in ${project.language === "Mixed" ? "the natural code-mixed language of the transcript (e.g. Hinglish), or English if there is no transcript" : project.language}. Use the native script for Indian languages.
- Captions are 1-2 short sentences, mention the part number naturally (e.g. "Part 3/20"), and only use facts from the transcript. If there is no transcript, write a neutral teaser based on the title only. Never invent facts.
- 3 to 5 hashtags per part, each starting with #, no spaces inside a hashtag.
- series_title: a short catchy series title based on the project title (keep the original meaning).
- Return exactly one entry per part_number.`;
  const user = [
    `Project title: ${project.title}`,
    `Content type: ${project.content_type}`,
    `Language: ${project.language}`,
    `Total parts in the series: ${totalParts}`,
    `Write captions only for these parts: ${parts.map((p) => p.part_number).join(", ")}`,
    "",
    ...parts.map((p) => `Part ${p.part_number}/${p.total_parts} transcript: ${p.transcript?.trim() || "(none)"}`),
  ].join("\n");
  const raw = await structuredChat(CaptionsSchema, system, user);
  return { seriesTitle: raw.series_title.trim(), results: normalizeCaptions(parts, raw) };
}

/** Writes captions in batches of 6 parts, 3 batches at a time, so long series don't time out. */
export async function generateCaptions(project: Project, parts: Part[]) {
  const batches: Part[][] = [];
  for (let i = 0; i < parts.length; i += BATCH_SIZE) batches.push(parts.slice(i, i + BATCH_SIZE));
  const out: Awaited<ReturnType<typeof captionBatch>>[] = [];
  for (let i = 0; i < batches.length; i += 3) {
    out.push(...(await Promise.all(batches.slice(i, i + 3).map((b) => captionBatch(project, b, parts.length)))));
  }
  return { seriesTitle: out[0]?.seriesTitle ?? "", results: out.flatMap((o) => o.results) };
}
