import { expect, it } from "vitest";
import { NO_SPEECH_REASON, normalizeAnalysis } from "@/lib/ai/analyze";
import { normalizeCaptions } from "@/lib/ai/captions";
import { AnalysisSchema, CaptionsSchema } from "@/lib/ai/schemas";
import type { Part } from "@/lib/types";

const part = (n: number, transcript: string | null): Part => ({
  id: `p${n}`, project_id: "x", part_number: n, total_parts: 3, title: "", caption: "", hashtags: [], video_url: "",
  start_seconds: 0, duration_seconds: 30, order: n, status: "queued", delivery_method: null, delivery_proof: null,
  error_message: null, idempotency_key: `k${n}`, transcript, ai_score: null, ai_important: false, ai_reason: null, attempts: 0, file_size: 1,
});

it("forces low score and 'No speech detected.' for silent parts, fills missing parts", () => {
  const analysis = AnalysisSchema.parse({ summary: "s", parts: [{ part_number: 1, score: 90, important: true, reason: "hook" }, { part_number: 2, score: 95, important: true, reason: "invented" }] });
  const out = normalizeAnalysis([part(1, "hello"), part(2, ""), part(3, "more")], analysis);
  expect(out[0]).toMatchObject({ score: 90, important: true });
  expect(out[1]).toMatchObject({ important: false, reason: NO_SPEECH_REASON });
  expect(out[1].score).toBeLessThanOrEqual(10);
  expect(out[2].important).toBe(false);
});

it("rejects captions with fewer than 3 hashtags", () => {
  expect(CaptionsSchema.safeParse({ series_title: "x", parts: [{ part_number: 1, caption: "c", hashtags: ["#a"] }] }).success).toBe(false);
});

it("normalizes hashtags", () => {
  const out = normalizeCaptions([part(1, null)], { series_title: "S", parts: [{ part_number: 1, caption: "c", hashtags: ["kochi", "##food", "street food", "kochi"] }] });
  expect(out[0].hashtags).toEqual(["#kochi", "#food", "#streetfood"]);
});

import { normalizeMoments } from "@/lib/ai/moments";

it("turns AI segment ranges into ordered, non-overlapping cuts within the max length", () => {
  const segs = [0, 1, 2, 3, 4, 5].map((i) => ({ index: i, start: i * 15, end: (i + 1) * 15, text: `s${i}` }));
  const out = normalizeMoments(segs, { summary: "", moments: [
    { start_segment: 4, end_segment: 5, title: "End", score: 60, important: false, reason: "r" },
    { start_segment: 0, end_segment: 3, title: "Hook", score: 90, important: true, reason: "r" },
    { start_segment: 3, end_segment: 3, title: "Dup", score: 10, important: false, reason: "r" },
  ] }, 40);
  // weak moments are dropped
  expect(normalizeMoments(segs, { summary: "", moments: [
    { start_segment: 0, end_segment: 0, title: "Hi", score: 20, important: true, reason: "r" },
    { start_segment: 2, end_segment: 2, title: "Reveal", score: 90, important: true, reason: "r" },
  ] }, 40).map((m) => m.title)).toEqual(["Reveal"]);
  expect(out.map((m) => [m.start, m.duration])).toEqual([[0, 30], [30, 30], [60, 30]]);
  expect(out[0].title).toBe("Hook (1/2)");
  expect(out[0].transcript).toBe("s0 s1");
  expect(out.map((m) => m.important)).toEqual([true, false, false]);
});

import { enforceImportance } from "@/lib/ai/importance";

it("never lets everything be important", () => {
  const out = enforceImportance([90, 85, 80, 78, 76, 95].map((score) => ({ score, important: true })));
  expect(out.filter((o) => o.important).map((o) => o.score).sort()).toEqual([90, 95]);
});
it("marks the best part when the model marks nothing", () => {
  expect(enforceImportance([{ score: 65, important: false }, { score: 40, important: false }]).map((o) => o.important)).toEqual([true, false]);
});

it("with a clip count, returns exactly that many strongest clips in time order, each within max length", () => {
  const segs = Array.from({ length: 12 }, (_, i) => ({ index: i, start: i * 10, end: (i + 1) * 10, text: `s${i}` }));
  const out = normalizeMoments(segs, { summary: "", moments: [
    { start_segment: 9, end_segment: 11, title: "C", score: 95, important: true, reason: "r" },
    { start_segment: 0, end_segment: 0, title: "A", score: 40, important: false, reason: "r" },
    { start_segment: 3, end_segment: 4, title: "B", score: 80, important: true, reason: "r" },
    { start_segment: 6, end_segment: 6, title: "D", score: 60, important: false, reason: "r" },
  ] }, 20, 3);
  expect(out.map((m) => m.title)).toEqual(["B", "D", "C"]);
  expect(out[2]).toMatchObject({ start: 90, duration: 20, transcript: "s9 s10" });
});
