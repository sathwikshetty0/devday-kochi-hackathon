"use client";

import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBanner, PageLoading, ScorePill, Spinner, StatusBadge, StepIndicator, Toggle, stepForStatus } from "@/components/ui";
import { api, useProject } from "@/lib/client";
import type { Part, ProjectBundle } from "@/lib/types";

function parseTags(s: string) {
  return s.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).slice(0, 10);
}

function PartCard({ part, index, count, locked, onMove, onRemove, onSaved, onError }: {
  part: Part; index: number; count: number; locked: boolean;
  onMove: (from: number, to: number) => void; onRemove: (p: Part) => void; onSaved: (p: Part) => void; onError: (m: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: part.id, disabled: locked });
  const [title, setTitle] = useState(part.title);
  const [caption, setCaption] = useState(part.caption);
  const [tags, setTags] = useState(part.hashtags.join(" "));
  const [saving, setSaving] = useState(false);

  useEffect(() => setTitle(part.title), [part.title]);
  useEffect(() => setCaption(part.caption), [part.caption]);
  useEffect(() => setTags(part.hashtags.join(" ")), [part.hashtags]);

  const save = async (fields: Partial<Pick<Part, "title" | "caption" | "hashtags" | "ai_important">>) => {
    setSaving(true);
    try {
      const { part: updated } = await api<{ part: Part }>(`/api/parts/${part.id}`, { method: "PATCH", json: fields });
      onSaved(updated);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card flex flex-col overflow-hidden ${part.ai_important ? "ring-2 ring-coral" : ""} ${isDragging ? "z-20 opacity-80 shadow-2xl" : ""}`}>
      <div className="relative bg-ink">
        <video src={`${part.video_url}#t=0.1`} controls playsInline preload="metadata" className="aspect-[9/16] max-h-80 w-full bg-black object-contain sm:aspect-video" />
        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white">{part.part_number}/{part.total_parts}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <ScorePill score={part.ai_score} important={part.ai_important} />
          {saving ? <span className="text-xs text-muted"><Spinner /> Saving</span> : <StatusBadge status={part.status} />}
        </div>
        {part.ai_reason && <p className="text-sm text-muted">{part.ai_reason}</p>}
        <div>
          <label className="label text-xs" htmlFor={`t-${part.id}`}>Title</label>
          <input id={`t-${part.id}`} className="input" value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== part.title && save({ title: title.trim() })} />
        </div>
        <div>
          <label className="label text-xs" htmlFor={`c-${part.id}`}>Caption</label>
          <textarea id={`c-${part.id}`} className="input min-h-20 py-3" value={caption} disabled={locked} maxLength={900} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== part.caption && save({ caption })} placeholder="Write a caption or use AI" />
        </div>
        <div>
          <label className="label text-xs" htmlFor={`h-${part.id}`}>Hashtags</label>
          <input id={`h-${part.id}`} className="input" value={tags} disabled={locked} onChange={(e) => setTags(e.target.value)} onBlur={() => tags !== part.hashtags.join(" ") && save({ hashtags: parseTags(tags) })} placeholder="#kochi #food #series" />
        </div>
        <Toggle checked={part.ai_important} disabled={locked} onChange={(v) => save({ ai_important: v })} label="Important — send this part" description={part.ai_score !== null ? "Overrides the AI's choice." : undefined} />
        <div className="mt-auto flex items-center gap-2 border-t border-cream-dark pt-3">
          <button ref={setActivatorNodeRef} {...listeners} {...attributes} disabled={locked} className="btn-ghost min-h-12 cursor-grab touch-none px-3" aria-label="Drag to reorder">⠿</button>
          <button className="btn-secondary min-h-12 flex-1 px-2" disabled={locked || index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move up">↑</button>
          <button className="btn-secondary min-h-12 flex-1 px-2" disabled={locked || index === count - 1} onClick={() => onMove(index, index + 1)} aria-label="Move down">↓</button>
          <button className="btn-ghost min-h-12 px-3 text-red-600" disabled={locked} onClick={() => onRemove(part)} aria-label="Remove part">Remove</button>
        </div>
      </div>
    </li>
  );
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, setData, error, refresh } = useProject(id);
  const [busy, setBusy] = useState<null | "captions" | "reorder" | "continue">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (error && !data) return <ErrorBanner message={error} onRetry={refresh} />;
  if (!data) return <PageLoading />;
  const { project, parts } = data;
  const locked = !["review", "awaiting_approval"].includes(project.status);
  const importantCount = parts.filter((p) => p.ai_important).length;

  const reorder = async (from: number, to: number) => {
    const ids = arrayMove(parts, from, to).map((p) => p.id);
    setData({ ...data, parts: arrayMove(parts, from, to) });
    setBusy("reorder");
    try {
      setData(await api<ProjectBundle>(`/api/projects/${id}/reorder`, { method: "POST", json: { ids } }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    reorder(parts.findIndex((p) => p.id === e.active.id), parts.findIndex((p) => p.id === e.over!.id));
  };

  const remove = async (p: Part) => {
    if (!confirm(`Remove "${p.title}"? The other parts will be renumbered.`)) return;
    try {
      await api(`/api/parts/${p.id}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const genCaptions = async () => {
    setBusy("captions");
    setActionError(null);
    try {
      setData(await api<ProjectBundle>(`/api/projects/${id}/captions`, { method: "POST" }));
    } catch (e) {
      setActionError(`AI captions failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const toApproval = async () => {
    setBusy("continue");
    try {
      await api(`/api/projects/${id}/ready`, { method: "POST" });
      router.push(`/projects/${id}/approve`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <div>
      <StepIndicator current={2} projectId={id} reached={stepForStatus(project.status)} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Review parts</h1>
          <p className="text-muted">{parts.length} parts · {importantCount} marked important · drag or use ↑↓ to reorder</p>
        </div>
        <button className="btn-secondary" onClick={genCaptions} disabled={!!busy || locked || !parts.length}>
          {busy === "captions" ? <><Spinner /> Writing captions…</> : "Generate titles and captions"}
        </button>
      </div>
      <ErrorBanner message={actionError} />
      {locked && (
        <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
          This series was approved and can&apos;t be edited. <Link className="font-semibold underline" href={`/projects/${id}/${project.status === "delivering" ? "approve" : "result"}`}>See delivery</Link>
        </div>
      )}
      {!parts.length ? (
        <div className="card px-6 py-12 text-center">
          <p className="font-display text-xl font-bold">No parts yet</p>
          <p className="mt-1 text-muted">Split your video first.</p>
          <Link href={`/projects/${id}/split`} className="btn-primary mt-4">Go to split</Link>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={parts.map((p) => p.id)} strategy={rectSortingStrategy}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {parts.map((p, i) => (
                <PartCard key={p.id} part={p} index={i} count={parts.length} locked={locked || busy === "reorder"}
                  onMove={reorder} onRemove={remove} onError={setActionError}
                  onSaved={(u) => setData((d) => (d ? { ...d, parts: d.parts.map((x) => (x.id === u.id ? u : x)) } : d))} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {!locked && parts.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-cream-dark bg-cream/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <Link href={`/projects/${id}/split`} className="btn-ghost">← Split</Link>
            <button className="btn-primary flex-1 text-lg sm:flex-none" onClick={toApproval} disabled={!!busy}>
              {busy === "continue" ? <Spinner /> : null} Continue to approval →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
