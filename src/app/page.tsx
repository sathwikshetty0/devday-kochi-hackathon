"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBanner, PageLoading, Spinner, StatusBadge, stepForStatus } from "@/components/ui";
import { api } from "@/lib/client";
import type { Project } from "@/lib/types";

const PATHS = ["split", "split", "review", "approve", "result"];

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const load = () =>
    api<{ projects: Project[] }>("/api/projects")
      .then((r) => {
        setProjects(r.projects);
        setError(null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const loadSample = async () => {
    setLoadingSample(true);
    setError(null);
    try {
      const { project } = await api<{ project: Project }>("/api/sample", { method: "POST" });
      router.push(`/projects/${project.id}/split`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoadingSample(false);
    }
  };

  return (
    <div>
      <section className="relative mb-10 overflow-hidden rounded-3xl border border-cream-dark bg-gradient-to-br from-white via-cream to-coral-soft/30 p-8 sm:p-12 shadow-[0_12px_40px_-15px_rgba(255,85,51,0.15)]">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-coral/30 bg-coral-soft/60 px-3.5 py-1 text-xs font-bold text-coral-dark">
            <span>✨ AI-Powered Video Clipper & Auto-Publisher</span>
          </div>
          <h1 className="text-4xl font-bold leading-[1.15] sm:text-5xl text-ink">
            Upload once. Approve once.
            <br />
            <span className="bg-gradient-to-r from-coral to-coral-dark bg-clip-text text-transparent">
              Reelix handles the rest.
            </span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            Turn one long video into numbered short parts with AI timeline intelligence. Approve once, and let Reelix automatically deliver to <strong>Telegram</strong>, <strong>YouTube Shorts</strong>, or <strong>Instagram Reels</strong> with verified proof.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/projects/new" className="btn-primary text-lg shadow-lg shadow-coral/25">
              + New project
            </Link>
            <button className="btn-secondary text-lg" onClick={loadSample} disabled={loadingSample}>
              {loadingSample ? <><Spinner /> Loading sample…</> : "Load sample project"}
            </button>
          </div>
        </div>
      </section>

      <ErrorBanner message={error} onRetry={load} />

      <h2 className="mb-3 text-xl font-bold">Your projects</h2>
      {projects === null && !error && <PageLoading label="Loading projects…" />}
      {projects?.length === 0 && (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-coral/10 text-2xl font-bold text-coral">▶</div>
          <p className="font-display text-xl font-bold">No projects yet</p>
          <p className="mt-1 max-w-sm text-muted">Start with your own long video, or load the sample project to see the whole flow in a minute.</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {projects?.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}/${PATHS[stepForStatus(p.status)]}`} className="card-hover block p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold leading-snug">{p.title}</h3>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-cream-dark/60 font-semibold px-2.5 py-1">{p.content_type}</span>
              <span className="rounded-full bg-cream-dark/60 font-semibold px-2.5 py-1">{p.language}</span>
              <span className="rounded-full bg-coral-soft font-semibold text-coral-dark px-2.5 py-1">
                {p.delivery_channel === "instagram" ? "📸 Instagram" : p.delivery_channel === "youtube" ? "🔴 YouTube" : "✈️ Telegram"}
              </span>
              <span className="rounded-full bg-cream-dark/60 font-semibold px-2.5 py-1">{p.part_count ?? 0} parts</span>
            </div>
            <p className="mt-3 text-xs text-muted">Created {new Date(p.created_date).toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
