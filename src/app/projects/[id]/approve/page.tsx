"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ActivityLogList } from "@/components/ActivityLogList";
import { ErrorBanner, PageLoading, Spinner, StatusBadge, StepIndicator, Toggle, stepForStatus } from "@/components/ui";
import { api, useProject } from "@/lib/client";
import type { Part, Project, ProjectBundle } from "@/lib/types";

type Integrations = { nvidia: boolean; telegram_token: boolean; telegram_chat: boolean };

export default function ApprovePage() {
  const { id } = useParams<{ id: string }>();
  const [sending, setSending] = useState(false);
  const { data, setData, error, refresh } = useProject(id, true, sending ? 1200 : 3000);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [busy, setBusy] = useState<null | "approve" | "stop">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const stopRequested = useRef(false);

  useEffect(() => {
    api<{ integrations: Integrations }>("/api/settings").then((s) => setIntegrations(s.integrations)).catch(() => {});
  }, []);

  if (error && !data) return <ErrorBanner message={error} onRetry={refresh} />;
  if (!data) return <PageLoading />;
  const { project, parts, logs } = data;

  const pending = parts.filter((p) => ["queued", "awaiting_approval"].includes(p.status));
  const toSendCount = project.send_important_only ? pending.filter((p) => p.ai_important).length : pending.length;
  const isTelegram = !project.delivery_channel || project.delivery_channel === "telegram";
  const telegramReady = integrations ? integrations.telegram_token && integrations.telegram_chat : true;
  const channelReady = isTelegram ? telegramReady : true;
  const canApprove = project.status === "awaiting_approval" && toSendCount > 0 && channelReady;
  const leftToSend = parts.filter((p) => p.status === "approved").length;
  const finished = ["completed", "failed", "stopped"].includes(project.status);
  const delivered = parts.filter((p) => p.status === "delivered").length;

  const patchProject = async (fields: Partial<Project>) => {
    try {
      setData(await api<ProjectBundle>(`/api/projects/${id}`, { method: "PATCH", json: fields }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Sends parts one at a time, checking for Stop between each. Only the server marks parts delivered. */
  const sendAll = async () => {
    setSending(true);
    stopRequested.current = false;
    try {
      while (true) {
        const b = await api<ProjectBundle>(`/api/projects/${id}`);
        setData(b);
        if (stopRequested.current || b.project.status === "stopped") break;
        const next = b.parts.find((p) => p.status === "approved");
        if (!next) break;
        await api<{ part: Part }>(`/api/parts/${next.id}/deliver`, { method: "POST" });
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
      refresh();
    }
  };

  const approve = async () => {
    setBusy("approve");
    setActionError(null);
    try {
      setData(await api<ProjectBundle>(`/api/projects/${id}/approve`, { method: "POST", json: { send_important_only: project.send_important_only } }));
      setBusy(null);
      await sendAll();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const stop = async () => {
    stopRequested.current = true;
    setBusy("stop");
    try {
      setData(await api<ProjectBundle>(`/api/projects/${id}/stop`, { method: "POST" }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <StepIndicator current={3} projectId={id} reached={stepForStatus(project.status)} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Approve and deliver</h1>
          <p className="text-muted">{project.title}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <ErrorBanner message={actionError} />
      {integrations && !telegramReady && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          Telegram isn&apos;t set up yet. Add <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_CHAT_ID</code> to the app secrets and restart. <Link href="/settings" className="font-semibold underline">Settings</Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          {project.status === "awaiting_approval" && (
            <section className="card p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-cream p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Parts to send</p>
                  <p className="font-display text-4xl font-bold">{toSendCount}<span className="text-lg text-muted">/{pending.length}</span></p>
                </div>
                <div className="rounded-2xl bg-cream p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Active Channel</p>
                  <p className="mt-1 font-display text-lg font-bold capitalize">
                    {project.delivery_channel === "instagram" ? "📸 Instagram Reels" : project.delivery_channel === "youtube" ? "🔴 YouTube Shorts" : "✈️ Telegram"}
                  </p>
                  <p className="text-xs text-muted">
                    {project.delivery_channel === "instagram" || project.delivery_channel === "youtube"
                      ? "Playwright Desktop Automation"
                      : telegramReady ? "Bot configured" : "Not configured"}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="label">Destination Platform</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => patchProject({ delivery_channel: "telegram" })}
                    className={`rounded-xl border p-3 text-left transition ${
                      (!project.delivery_channel || project.delivery_channel === "telegram")
                        ? "border-coral bg-coral-soft font-bold text-coral-dark"
                        : "border-cream-dark hover:border-gray-400"
                    }`}
                  >
                    <div className="text-xl">✈️</div>
                    <div className="text-sm">Telegram</div>
                    <div className="text-xs font-normal text-muted">Bot API</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => patchProject({ delivery_channel: "instagram" })}
                    className={`rounded-xl border p-3 text-left transition ${
                      project.delivery_channel === "instagram"
                        ? "border-coral bg-coral-soft font-bold text-coral-dark"
                        : "border-cream-dark hover:border-gray-400"
                    }`}
                  >
                    <div className="text-xl">📸</div>
                    <div className="text-sm">Instagram</div>
                    <div className="text-xs font-normal text-muted">Desktop Reels</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => patchProject({ delivery_channel: "youtube" })}
                    className={`rounded-xl border p-3 text-left transition ${
                      project.delivery_channel === "youtube"
                        ? "border-coral bg-coral-soft font-bold text-coral-dark"
                        : "border-cream-dark hover:border-gray-400"
                    }`}
                  >
                    <div className="text-xl">🔴</div>
                    <div className="text-sm">YouTube</div>
                    <div className="text-xs font-normal text-muted">Desktop Shorts</div>
                  </button>
                </div>
              </div>

              <div className="mt-4 divide-y divide-cream-dark">
                <Toggle checked={project.send_important_only} onChange={(v) => patchProject({ send_important_only: v })} label="Send only important parts"
                  description='Other parts are cancelled with "Skipped: not marked important."' />
                <Toggle checked={project.simulate_failure} onChange={(v) => patchProject({ simulate_failure: v })} label="Simulate failure" description="Fails one part on its first try so you can show recovery." />
              </div>
              <button className="btn-primary mt-4 min-h-16 w-full text-xl" onClick={approve} disabled={!canApprove || !!busy}>
                {busy === "approve" ? <><Spinner /> Approving…</> : `Approve series (${toSendCount} part${toSendCount === 1 ? "" : "s"})`}
              </button>
              <p className="mt-2 text-center text-xs text-muted">Nothing is sent until you press Approve.</p>
            </section>
          )}

          {project.status === "delivering" && !sending && leftToSend > 0 && (
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <span>{leftToSend} approved part(s) are waiting to be sent.</span>
              <button className="btn-primary" onClick={sendAll}>Resume sending</button>
            </div>
          )}

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Live status</h2>
              {sending && <span className="flex items-center gap-2 text-sm text-muted"><Spinner /> Sending one at a time…</span>}
            </div>
            <ul className="space-y-2">
              {parts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.title}</span>
                    {p.delivery_proof && (
                      <span className="block text-xs text-emerald-700">
                        {p.delivery_method === "instagram" ? (
                          <a href={p.delivery_proof.startsWith("http") ? p.delivery_proof : `https://www.instagram.com/reel/${p.delivery_proof}/`} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                            Proof: Instagram Reel ↗
                          </a>
                        ) : p.delivery_method === "youtube" ? (
                          <a href={p.delivery_proof.startsWith("http") ? p.delivery_proof : `https://youtube.com/shorts/${p.delivery_proof}`} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                            Proof: YouTube Short ↗
                          </a>
                        ) : (
                          <span>Proof: Telegram message #{p.delivery_proof}</span>
                        )}
                      </span>
                    )}
                    {p.error_message && p.status !== "delivered" && <span className="block text-xs text-muted">{p.error_message}</span>}
                  </span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
            {finished && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-coral-soft/50 px-4 py-3">
                <span className="font-semibold">{delivered} of {parts.length} parts delivered with proof.</span>
                <Link href={`/projects/${id}/result`} className="btn-primary">See results →</Link>
              </div>
            )}
          </section>
        </div>

        <section className="card h-fit p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Activity log</h2>
          <ActivityLogList logs={logs} />
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-red-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="hidden flex-1 text-sm text-muted sm:block">Stop cancels every part that hasn&apos;t been sent yet.</span>
          <button className="btn-danger min-h-14 w-full text-lg sm:w-auto sm:px-10" onClick={stop} disabled={busy === "stop" || finished}>
            {busy === "stop" ? <Spinner /> : "■"} Stop
          </button>
        </div>
      </div>
    </div>
  );
}
