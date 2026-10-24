"use client";

import { useEffect, useState } from "react";
import { ErrorBanner, PageLoading, Toggle } from "@/components/ui";
import { api } from "@/lib/client";

type Settings = { simulate_failure: boolean; integrations: { nvidia: boolean; telegram_token: boolean; telegram_chat: boolean } };

function Status({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{ok ? "Configured" : "Missing"}</span>
    </li>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Settings>("/api/settings").then(setS).catch((e) => setError(e.message));
  }, []);
  const update = async (v: boolean) => {
    try {
      setS(await api<Settings>("/api/settings", { method: "PATCH", json: { simulate_failure: v } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-5 text-3xl font-bold">Settings</h1>
      <ErrorBanner message={error} />
      {!s && !error && <PageLoading />}
      {s && (
        <>
          <section className="card mb-5 p-5">
            <h2 className="mb-1 text-lg font-bold">Demo</h2>
            <Toggle checked={s.simulate_failure} onChange={update} label="Simulate failure"
              description="Fails exactly one part on its first delivery try, so you can show the error and Retry. Applies to series not yet sent." />
          </section>
          <section className="card p-5">
            <h2 className="mb-1 text-lg font-bold">Connections</h2>
            <p className="text-sm text-muted">Secrets live in the server environment (.env.local), never in the browser or database. Reelix never asks for social media passwords.</p>
            <ul className="mt-2 divide-y divide-cream-dark">
              <Status ok={s.integrations.telegram_token} label="Telegram bot token" hint="TELEGRAM_BOT_TOKEN from @BotFather" />
              <Status ok={s.integrations.telegram_chat} label="Telegram channel" hint="TELEGRAM_CHAT_ID; add the bot as an admin of the channel" />
              <Status ok={s.integrations.nvidia} label="NVIDIA AI" hint="NVIDIA_API_KEY for transcripts, analysis and captions" />
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
