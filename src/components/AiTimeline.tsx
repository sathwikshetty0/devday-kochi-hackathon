"use client";

import { formatTime } from "@/lib/split-math";
import type { Part, Project } from "@/lib/types";
import { ScorePill, Spinner } from "./ui";

export function AiTimeline({ project, parts, busyLabel }: { project: Project; parts: Part[]; busyLabel: string | null }) {
  const analyzed = parts.some((p) => p.ai_score !== null) || !!project.ai_summary;
  const transcribed = parts.some((p) => p.transcript !== null);
  if (!analyzed && !transcribed && !busyLabel) return null;
  return (
    <section className="card mt-6 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">AI analysis — transcript timeline</h2>
        {busyLabel && <span className="flex items-center gap-2 text-sm text-muted"><Spinner /> {busyLabel}</span>}
      </div>
      {project.ai_summary && (
        <div className="mb-4 rounded-2xl bg-cream px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Summary</p>
          <p className="mt-1">{project.ai_summary}</p>
        </div>
      )}
      <ol className="space-y-3">
        {parts.map((p) => (
          <li key={p.id} className={`rounded-2xl border-2 p-4 ${p.ai_important ? "border-coral bg-coral-soft/30" : "border-cream-dark"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold">
                Part {p.part_number} · {formatTime(p.start_seconds)}–{formatTime(p.start_seconds + p.duration_seconds)}
              </span>
              <ScorePill score={p.ai_score} important={p.ai_important} />
            </div>
            <p className={`mt-2 text-sm ${p.transcript ? "" : "italic text-muted"}`}>
              {p.transcript === null ? "Not transcribed yet." : p.transcript || "No speech detected."}
            </p>
            {p.ai_reason && <p className="mt-2 text-sm text-muted"><span className="font-semibold text-ink">Why:</span> {p.ai_reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
