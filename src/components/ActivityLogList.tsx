"use client";

import { timeAgo } from "@/lib/client";
import type { ActivityLog } from "@/lib/types";

export function ActivityLogList({ logs, max = 50 }: { logs: ActivityLog[]; max?: number }) {
  if (!logs.length) return <p className="text-sm text-muted">No activity yet.</p>;
  return (
    <ol className="max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
      {logs.slice(0, max).map((l) => (
        <li key={l.id} className="flex gap-3">
          <time className="shrink-0 font-mono text-xs leading-5 text-muted">{timeAgo(l.timestamp)}</time>
          <span>
            <span className="font-semibold">{l.event}</span>
            {l.detail && <span className="text-muted"> — {l.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
