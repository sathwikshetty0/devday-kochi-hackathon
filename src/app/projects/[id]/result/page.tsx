"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ActivityLogList } from "@/components/ActivityLogList";
import { ErrorBanner, PageLoading, Spinner, StatusBadge, StepIndicator } from "@/components/ui";
import { api, useProject } from "@/lib/client";
import type { Part } from "@/lib/types";

function splitError(msg: string | null) {
  if (!msg) return { what: "", next: "" };
  const [what, next] = msg.split(/\s*Next step:\s*/);
  return { what, next: next || "" };
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, refresh } = useProject(id);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error && !data) return <ErrorBanner message={error} onRetry={refresh} />;
  if (!data) return <PageLoading />;
  const { project, parts, logs } = data;
  const delivered = parts.filter((p) => p.status === "delivered").length;
  const failed = parts.filter((p) => p.status === "failed").length;
  const cancelled = parts.filter((p) => p.status === "cancelled").length;

  const retry = async (p: Part) => {
    setRetrying(p.id);
    setActionError(null);
    try {
      await api(`/api/parts/${p.id}/retry`, { method: "POST" });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(null);
      refresh();
    }
  };

  return (
    <div>
      <StepIndicator current={4} projectId={id} reached={4} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Result</h1>
          <p className="text-muted">{project.title}</p>
        </div>
        <a href={`/api/projects/${id}/export`} className="btn-primary" download>⬇ Download all (zip)</a>
      </div>
      <ErrorBanner message={actionError} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="card p-4 text-center"><p className="font-display text-3xl font-bold text-emerald-600">{delivered}</p><p className="text-sm text-muted">Delivered</p></div>
        <div className="card p-4 text-center"><p className="font-display text-3xl font-bold text-red-600">{failed}</p><p className="text-sm text-muted">Failed</p></div>
        <div className="card p-4 text-center"><p className="font-display text-3xl font-bold text-stone-500">{cancelled}</p><p className="text-sm text-muted">Cancelled</p></div>
      </div>
      {project.status === "delivering" && (
        <p className="mb-4 rounded-2xl bg-blue-50 px-4 py-3 text-blue-900">Still sending. <Link href={`/projects/${id}/approve`} className="font-semibold underline">Watch live</Link></p>
      )}
      <ul className="space-y-3">
        {parts.map((p) => {
          const { what, next } = splitError(p.error_message);
          return (
            <li key={p.id} className={`card p-4 ${p.status === "failed" ? "border-red-200" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{p.title}</span>
                <StatusBadge status={p.status} />
              </div>
              {p.status === "delivered" && (
                <p className="mt-2 text-sm text-emerald-700">✓ Proof: Telegram message_id <span className="font-mono font-bold">{p.delivery_proof}</span></p>
              )}
              {p.status === "cancelled" && what && <p className="mt-2 text-sm text-muted">{what}</p>}
              {p.status === "failed" && (
                <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm">
                  <p className="text-red-800"><span className="font-semibold">What happened:</span> {what}</p>
                  {next && <p className="mt-1 text-red-800"><span className="font-semibold">What to do:</span> {next}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-primary min-h-11" onClick={() => retry(p)} disabled={!!retrying || project.status === "stopped"}>
                      {retrying === p.id ? <><Spinner /> Retrying…</> : "Retry"}
                    </button>
                    <a className="btn-secondary min-h-11" href={p.video_url} download={`part_${String(p.part_number).padStart(2, "0")}.mp4`}>Download this part</a>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-lg font-bold">Activity log</h2>
        <ActivityLogList logs={logs} max={100} />
      </section>
    </div>
  );
}
