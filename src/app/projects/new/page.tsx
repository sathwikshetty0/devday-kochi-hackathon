"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorBanner, Spinner, StepIndicator } from "@/components/ui";
import { api, setOriginalVideo } from "@/lib/client";
import { CONTENT_TYPES, LANGUAGES, type Project } from "@/lib/types";

const WARN_BYTES = 300 * 1024 * 1024;

export default function NewProject() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<string>(CONTENT_TYPES[0]);
  const [language, setLanguage] = useState<string>("Malayalam");
  const [rights, setRights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooBig = !!file && file.size > WARN_BYTES;
  const canSubmit = !!file && title.trim() && rights && !saving;

  const pick = (f: File | null) => {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 80));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setSaving(true);
    setError(null);
    try {
      const { project } = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        json: { title: title.trim(), content_type: contentType, language, rights_confirmed: rights },
      });
      setOriginalVideo(project.id, file);
      router.push(`/projects/${project.id}/split`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <StepIndicator current={0} />
      <h1 className="mb-1 text-3xl font-bold">New project</h1>
      <p className="mb-6 text-muted">Pick one long video. It stays on your device while Reelix splits it.</p>
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="card space-y-5 p-5 sm:p-6">
        <div>
          <span className="label">Video</span>
          <label className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${file ? "border-coral bg-coral-soft/40" : "border-cream-dark hover:border-coral"}`}>
            <input type="file" accept="video/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            {file ? (
              <>
                <span className="font-semibold">{file.name}</span>
                <span className="text-sm text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB · tap to change</span>
              </>
            ) : (
              <>
                <span className="text-3xl">⬆️</span>
                <span className="font-semibold">Tap to choose a video</span>
                <span className="text-sm text-muted">MP4, MOV or WebM</span>
              </>
            )}
          </label>
          {tooBig && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This file is over 300 MB. Splitting runs in your browser and may be very slow or run out of memory. Try a shorter test video (1–3 minutes) for the demo.
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kochi Diaries Episode 4" maxLength={120} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ctype">Content type</label>
            <select id="ctype" className="input" value={contentType} onChange={(e) => setContentType(e.target.value)}>
              {CONTENT_TYPES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lang">Language</label>
            <select id="lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl bg-cream px-4 py-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-coral" checked={rights} onChange={(e) => setRights(e.target.checked)} required />
          <span className="font-medium">I own this video or have permission to use it.</span>
        </label>
        <button className="btn-primary w-full text-lg" disabled={!canSubmit}>
          {saving ? <><Spinner /> Creating…</> : "Continue to split"}
        </button>
      </form>
    </div>
  );
}
