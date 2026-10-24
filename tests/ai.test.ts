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
