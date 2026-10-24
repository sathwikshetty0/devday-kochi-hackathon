"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiTimeline } from "@/components/AiTimeline";
import { ErrorBanner, PageLoading, ProgressBar, Spinner, StepIndicator, Toggle, stepForStatus } from "@/components/ui";
import { api, getOriginalVideo, setOriginalVideo, uploadWithProgress, useProject } from "@/lib/client";
import { formatDurationWords, planParts } from "@/lib/split-math";
import { browserDuration, encodePart, ffmpegDuration, loadFFmpeg, mountInput } from "@/lib/splitter";

const LENGTHS = [15, 30, 45, 60];

type RowState = { phase: "waiting" | "encoding" | "uploading" | "done" | "error"; progress: number; message?: string };
type Busy = null | "engine" | "splitting" | "ai";

export default function SplitPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, refresh } = useProject(id);
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [length, setLength] = useState(30);
  const [custom, setCustom] = useState("");
  const [merge, setMerge] = useState(true);
  const [badge, setBadge] = useState(true);
  const [crop, setCrop] = useState(false);
  const [aiAfter, setAiAfter] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [aiRows, setAiRows] = useState<Record<string, "waiting" | "working" | "done" | "error">>({});
  const [aiStage, setAiStage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const initialized = useRef(false);

  const project = data?.project;
  const parts = useMemo(() => data?.parts ?? [], [data]);
  const partLength = custom ? Math.max(5, Math.min(600, Math.round(Number(custom) || 0))) : length;
  const plan = useMemo(() => (duration ? planParts(duration, partLength, merge) : []), [duration, partLength, merge]);
  const locked = !!project && ["delivering", "completed", "stopped", "failed", "awaiting_approval"].includes(project.status);

  useEffect(() => {
    if (!project || initialized.current) return;
    initialized.current = true;
    if (LENGTHS.includes(project.part_length_seconds)) setLength(project.part_length_seconds);
    else setCustom(String(project.part_length_seconds));
    setMerge(project.merge_short_last);
    setBadge(project.add_part_badge);
    setCrop(project.crop_9_16);
    const f = getOriginalVideo(id);
    if (f) choose(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, id]);

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function choose(f: File) {
    setFile(f);
    setOriginalVideo(id, f);
    setDuration(null);
    const d = await browserDuration(f);
    if (d) return setDuration(d);
    try {
      setBusy("engine");
      const ff = await loadFFmpeg();
      const input = await mountInput(ff, f);
      const fd = await ffmpegDuration(ff, input.path);
      await input.cleanup();
      if (fd) setDuration(fd);
      else setActionError("Couldn't read the length of this video. Try an MP4 file.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const setRow = (i: number, patch: Partial<RowState>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function runAi() {
    const b = await refresh();
    const list = b?.parts ?? parts;
    if (!list.length) return;
    setBusy("ai");
    setActionError(null);
    setAiRows(Object.fromEntries(list.map((p) => [p.id, p.transcript === null ? "waiting" : "done"])));
    try {
      for (const p of list.filter((x) => x.transcript === null)) {
        setAiStage(`Transcribing part ${p.part_number} of ${list.length}…`);
        setAiRows((r) => ({ ...r, [p.id]: "working" }));
        try {
          await api(`/api/parts/${p.id}/transcribe`, { method: "POST" });
          setAiRows((r) => ({ ...r, [p.id]: "done" }));
        } catch (e) {
          setAiRows((r) => ({ ...r, [p.id]: "error" }));
          throw e;
        }
        refresh();
      }
      setAiStage("Finding the most important parts…");
      await api(`/api/projects/${id}/analyze`, { method: "POST" });
      await refresh();
    } catch (e) {
      setActionError(`AI analysis failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAiStage(null);
      setBusy(null);
    }
  }

  async function startSplit() {
    if (!file || !plan.length) return;
    if (parts.length && !confirm(`This replaces the ${parts.length} existing parts. Continue?`)) return;
    setActionError(null);
    setRows(plan.map(() => ({ phase: "waiting", progress: 0 })));
    try {
      await api(`/api/projects/${id}`, { method: "PATCH", json: { part_length_seconds: partLength, merge_short_last: merge, add_part_badge: badge, crop_9_16: crop } });
      await api(`/api/projects/${id}/parts`, { method: "DELETE" });
      await refresh();
      setBusy("engine");
      const ff = await loadFFmpeg();
      setBusy("splitting");
      const input = await mountInput(ff, file);
      try {
        for (let i = 0; i < plan.length; i++) {
          const part = plan[i];
          setRow(i, { phase: "encoding", progress: 0 });
          let bytes: Uint8Array;
          try {
            bytes = await encodePart(ff, input.path, part, plan.length, { crop916: crop, badge }, (p) => setRow(i, { progress: p }));
          } catch (e) {
            setRow(i, { phase: "error", message: e instanceof Error ? e.message : String(e) });
            throw e;
          }
          setRow(i, { phase: "uploading", progress: 0 });
          const form = new FormData();
          form.append("file", new Blob([new Uint8Array(bytes)], { type: "video/mp4" }), `part_${part.part_number}.mp4`);
          form.append("part_number", String(part.part_number));
          form.append("total_parts", String(plan.length));
          form.append("start_seconds", String(part.start));
          form.append("duration_seconds", String(part.duration));
          try {
            await uploadWithProgress(`/api/projects/${id}/parts`, form, (p) => setRow(i, { progress: p }));
          } catch (e) {
            setRow(i, { phase: "error", message: e instanceof Error ? e.message : String(e) });
            throw e;
          }
          setRow(i, { phase: "done", progress: 1, message: `${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB` });
        }
      } finally {
        await input.cleanup();
      }
      await refresh();
      setBusy(null);
      if (aiAfter) await runAi();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      setBusy(null);
      refresh();
    }
  }

  if (error && !data) return <ErrorBanner message={error} onRetry={refresh} />;
  if (!project) return <PageLoading />;

  const doneCount = rows.filter((r) => r.phase === "done").length;
  const showRows = rows.length > 0;
  const canContinue = parts.length > 0 && !busy && project.status !== "splitting";

  return (
    <div>
      <StepIndicator current={1} projectId={id} reached={stepForStatus(project.status)} />
      <h1 className="text-3xl font-bold">Split settings</h1>
      <p className="mb-5 text-muted">{project.title} · {project.content_type} · {project.language}</p>
      <ErrorBanner message={actionError} />
      {locked && (
        <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
          This series is past splitting ({project.status.replace("_", " ")}). <Link className="font-semibold underline" href={`/projects/${id}/${project.status === "awaiting_approval" ? "approve" : "result"}`}>Go to the current step</Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="card space-y-5 p-5 lg:col-span-3">
          <div>
            <span className="label">Source video</span>
            {file ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-4 py-3">
                <span className="min-w-0 truncate font-medium">{file.name}</span>
                <span className="text-sm text-muted">{duration ? formatDurationWords(duration) : <><Spinner /> reading length…</>}</span>
              </div>
            ) : (
              <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-cream-dark px-4 text-center hover:border-coral">
                <input type="file" accept="video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} disabled={!!busy || locked} />
                <span>{parts.length ? "Choose the video again to re-split" : "Choose your video to split (it stays on this device)"}</span>
              </label>
            )}
          </div>

          <div>
            <span className="label">Part length</span>
            <div className="grid grid-cols-5 gap-2">
              {LENGTHS.map((l) => (
                <button key={l} type="button" onClick={() => { setLength(l); setCustom(""); }} disabled={!!busy || locked}
                  className={`min-h-12 rounded-2xl border font-semibold ${!custom && length === l ? "border-coral bg-coral text-white" : "border-cream-dark bg-white"}`}>
                  {l}s
                </button>
              ))}
              <input inputMode="numeric" placeholder="Custom" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} disabled={!!busy || locked}
                className={`input min-w-0 px-2 text-center ${custom ? "border-coral" : ""}`} aria-label="Custom part length in seconds" />
            </div>
            <p className="mt-3 rounded-2xl bg-coral-soft/60 px-4 py-3 font-display text-lg font-semibold text-coral-dark">
              {duration ? `${formatDurationWords(duration)} video at ${partLength} sec = ${plan.length} part${plan.length === 1 ? "" : "s"}` : "Choose a video to see how many parts you'll get"}
            </p>
          </div>

          <div className="divide-y divide-cream-dark">
            <Toggle checked={merge} onChange={setMerge} disabled={!!busy || locked} label="Merge a very short last part" description="If the last part is under a third of the length, add it to the previous part." />
            <Toggle checked={badge} onChange={setBadge} disabled={!!busy || locked} label='Add a "Part n/N" badge' description="Burned into the top corner of each part." />
            <Toggle checked={crop} onChange={setCrop} disabled={!!busy || locked} label="Crop to 9:16" description={crop ? "Vertical, for Reels and Shorts." : "Keeping the original shape."} />
            <Toggle checked={aiAfter} onChange={setAiAfter} disabled={!!busy} label="AI analysis after splitting" description="Transcript + mark important parts." />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="btn-primary flex-1 text-lg" onClick={startSplit} disabled={!file || !plan.length || !!busy || locked}>
              {busy === "engine" ? <><Spinner /> Loading video engine…</> : busy === "splitting" ? <><Spinner /> Splitting {doneCount}/{rows.length}…</> : parts.length ? "Split again" : `Split into ${plan.length || "…"} parts`}
            </button>
            {parts.length > 0 && (
              <button className="btn-secondary flex-1" onClick={runAi} disabled={!!busy || locked}>
                {busy === "ai" ? <><Spinner /> {aiStage || "Analyzing…"}</> : `Run AI analysis on ${parts.length} parts`}
              </button>
            )}
          </div>
          {busy === "engine" && <p className="text-sm text-muted">First time only: downloading the in-browser video engine (~30 MB).</p>}
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Parts</h2>
          {showRows ? (
            <ol className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {rows.map((r, i) => (
                <li key={i}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">Part {i + 1}/{rows.length}</span>
                    <span className={r.phase === "error" ? "text-red-600" : "text-muted"}>
                      {r.phase === "waiting" && "Waiting"}
                      {r.phase === "encoding" && `Cutting ${Math.round(r.progress * 100)}%`}
                      {r.phase === "uploading" && `Uploading ${Math.round(r.progress * 100)}%`}
                      {r.phase === "done" && `Done · ${r.message}`}
                      {r.phase === "error" && "Failed"}
                    </span>
                  </div>
                  <ProgressBar value={r.phase === "done" ? 1 : r.phase === "uploading" ? 0.5 + r.progress / 2 : r.phase === "encoding" ? r.progress / 2 : 0} tone={r.phase === "done" ? "green" : r.phase === "error" ? "red" : "coral"} />
                  {r.phase === "error" && <p className="mt-1 text-sm text-red-600">{r.message}</p>}
                </li>
              ))}
            </ol>
          ) : parts.length ? (
            <ul className="space-y-2 text-sm">
              {parts.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl bg-cream px-3 py-2">
                  <span className="font-medium">Part {p.part_number}/{p.total_parts}</span>
                  <span className="text-muted">
                    {aiRows[p.id] === "working" ? <><Spinner /> transcribing</> : `${Math.round(p.duration_seconds)}s${p.file_size ? ` · ${(p.file_size / 1024 / 1024).toFixed(1)} MB` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No parts yet. Choose your settings and press Split.</p>
          )}
        </section>
      </div>

      <AiTimeline project={project} parts={parts} busyLabel={busy === "ai" ? aiStage : null} />

      <div className="mt-6 flex justify-end">
        {canContinue && (
          <Link href={`/projects/${id}/review`} className="btn-primary w-full text-lg sm:w-auto">Continue to review →</Link>
        )}
      </div>
    </div>
  );
}
