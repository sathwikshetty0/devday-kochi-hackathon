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
      <section className="mb-8">
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Upload once. Approve once.
          <br />
          <span className="text-coral">Reelix handles the rest.</span>
        </h1>
        <p className="mt-3 max-w-xl text-muted">Turn one long video into a numbered series of short parts, let AI find the moments that matter, approve the whole series once, and get proof for every part delivered to Telegram.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href="/projects/new" className="btn-primary text-lg">+ New project</Link>
          <button className="btn-secondary text-lg" onClick={loadSample} disabled={loadingSample}>
            {loadingSample ? <><Spinner /> Loading sample…</> : "Load sample project"}
          </button>
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
          <Link key={p.id} href={`/projects/${p.id}/${PATHS[stepForStatus(p.status)]}`} className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold leading-snug">{p.title}</h3>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
              <span className="rounded-full bg-cream px-3 py-1">{p.content_type}</span>
              <span className="rounded-full bg-cream px-3 py-1">{p.language}</span>
              <span className="rounded-full bg-cream px-3 py-1">{p.part_count ?? 0} parts</span>
            </div>
            <p className="mt-3 text-xs text-muted">Created {new Date(p.created_date).toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
