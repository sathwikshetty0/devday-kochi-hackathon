import { NextResponse } from "next/server";
import { getLogs, getParts, getProject } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response | unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 500) console.error(err);
      return NextResponse.json({ error: message }, { status });
    }
  };
}

export function bundle(id: string) {
  const project = getProject(id);
  if (!project) throw new HttpError(404, "Project not found");
  return { project, parts: getParts(id), logs: getLogs(id) };
}

export function requireProject(id: string) {
  const project = getProject(id);
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

export type Ctx<P> = { params: Promise<P> };
