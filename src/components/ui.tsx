"use client";

import Link from "next/link";
import type { PartStatus, ProjectStatus } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  splitting: "bg-sky-100 text-sky-800",
  review: "bg-violet-100 text-violet-800",
  awaiting_approval: "bg-amber-100 text-amber-800",
  delivering: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  stopped: "bg-stone-200 text-stone-700",
  failed: "bg-red-100 text-red-700",
  queued: "bg-stone-100 text-stone-700",
  approved: "bg-teal-100 text-teal-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-stone-200 text-stone-600",
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
};

export function StatusBadge({ status }: { status: ProjectStatus | PartStatus }) {
  const label = STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status] || "bg-stone-100"}`}>
      {(status === "delivering" || status === "splitting") && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </span>
  );
}

const STEPS = ["Upload", "Split", "Review", "Approve", "Result"] as const;
const STEP_PATHS = ["", "split", "review", "approve", "result"];

export function stepForStatus(status: ProjectStatus) {
  switch (status) {
    case "draft":
    case "splitting":
      return 1;
    case "review":
      return 2;
    case "awaiting_approval":
      return 3;
    default:
      return 4;
  }
}

export function StepIndicator({ current, projectId, reached }: { current: number; projectId?: string; reached?: number }) {
  const maxReached = reached ?? current;
  return (
    <ol className="mb-6 flex items-center gap-1 overflow-x-auto pb-1 text-sm" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = projectId && i > 0 && i <= maxReached && !active;
        const dot = (
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? "bg-coral text-white" : done ? "bg-coral-soft text-coral-dark" : "bg-cream-dark text-muted"}`}>
            {done ? "✓" : i + 1}
          </span>
        );
        const content = (
          <span className={`flex items-center gap-2 rounded-full px-2 py-1 ${active ? "font-semibold text-ink" : "text-muted"}`}>
            {dot}
            <span className="whitespace-nowrap">{s}</span>
          </span>
        );
        return (
          <li key={s} className="flex items-center gap-1">
            {clickable ? <Link href={`/projects/${projectId}/${STEP_PATHS[i]}`} className="hover:underline">{content}</Link> : content}
            {i < STEPS.length - 1 && <span className={`h-0.5 w-4 shrink-0 rounded sm:w-8 ${done ? "bg-coral" : "bg-cream-dark"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-start justify-between gap-4 py-2 ${disabled ? "opacity-50" : ""}`}>
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-8 w-14 shrink-0 rounded-full transition ${checked ? "bg-coral" : "bg-stone-300"}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${checked ? "left-7" : "left-1"}`} />
      </button>
    </label>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
      <span>{message}</span>
      {onRetry && <button className="btn-secondary min-h-10 text-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function ProgressBar({ value, tone = "coral" }: { value: number; tone?: "coral" | "green" | "red" }) {
  const color = tone === "green" ? "bg-emerald-500" : tone === "red" ? "bg-red-500" : "bg-coral";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-cream-dark" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function ScorePill({ score, important }: { score: number | null; important: boolean }) {
  if (score === null) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${score >= 70 ? "bg-coral text-white" : score >= 40 ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}>{score}/100</span>
      {important && <span className="rounded-full bg-coral-soft px-2.5 py-0.5 text-xs font-bold text-coral-dark">★ Important</span>}
    </span>
  );
}
