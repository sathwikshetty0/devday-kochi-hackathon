"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectBundle } from "./types";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/** Loads a project bundle; optionally polls while `poll` is true. */
export function useProject(id: string, poll = false, intervalMs = 1500) {
  const [data, setData] = useState<ProjectBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const b = await api<ProjectBundle>(`/api/projects/${id}`);
      if (alive.current) {
        setData(b);
        setError(null);
      }
      return b;
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [id]);
  useEffect(() => {
    alive.current = true;
    refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!poll) return;
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [poll, intervalMs, refresh]);
  return { data, setData, error, refresh };
}

/** Upload with progress via XHR (fetch has no upload progress). */
export function uploadWithProgress(url: string, form: FormData, onProgress: (ratio: number) => void) {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(form);
  });
}

// The original video stays in the browser (it can be hundreds of MB); only parts are uploaded.
const videoStore = new Map<string, File>();
export const setOriginalVideo = (projectId: string, file: File) => videoStore.set(projectId, file);
export const getOriginalVideo = (projectId: string) => videoStore.get(projectId) ?? null;

export function timeAgo(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
