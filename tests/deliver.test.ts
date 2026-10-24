import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DB_FILE = ":memory:";
import { getPart, getProject, insertPart, insertProject, resetDbForTests, updatePart } from "@/lib/db";
import { deliverPart, SIMULATED_FAILURE_MESSAGE, stopProject, type DeliverDeps } from "@/lib/deliver";
import type { Part, Project } from "@/lib/types";

function seed(parts = 2, extra: Partial<Project> = {}) {
  const project: Project = {
    id: randomUUID(), title: "T", content_type: "Vlog or challenge", language: "English", original_video_url: null,
    part_length_seconds: 30, merge_short_last: true, add_part_badge: false, crop_9_16: false, simulate_failure: false,
    failure_simulated: false, send_important_only: false, status: "delivering", rights_confirmed: true, ai_summary: null,
    created_date: new Date().toISOString(), ...extra,
  };
  insertProject(project);
  const ids: string[] = [];
  for (let n = 1; n <= parts; n++) {
    const part: Part = {
      id: randomUUID(), project_id: project.id, part_number: n, total_parts: parts, title: `T - Part ${n}/${parts}`,
      caption: "", hashtags: [], video_url: "/api/files/x.mp4", start_seconds: 0, duration_seconds: 30, order: n,
      status: "approved", delivery_method: null, delivery_proof: null, error_message: null, idempotency_key: randomUUID(),
      transcript: null, ai_score: null, ai_important: false, ai_reason: null, attempts: 0, file_size: 1,
    };
    insertPart(part);
    ids.push(part.id);
  }
  return { project, ids };
}

let msg = 100;
const okDeps = (): DeliverDeps => ({
  readVideo: async () => Buffer.from("video"),
  send: vi.fn(async () => ({ ok: true, messageId: ++msg })),
});

beforeEach(() => resetDbForTests());

describe("deliverPart", () => {
  it("delivers with message_id proof and completes the project", async () => {
    const { project, ids } = seed(1);
    const deps = okDeps();
    const out = await deliverPart(ids[0], deps);
    expect(out.part.status).toBe("delivered");
    expect(out.part.delivery_proof).toBe(String(msg));
    expect(getProject(project.id)!.status).toBe("completed");
  });

  it("is idempotent: a delivered part is skipped and not re-sent", async () => {
    const { ids } = seed(1);
    const deps = okDeps();
    await deliverPart(ids[0], deps);
    const again = await deliverPart(ids[0], deps);
    expect(again.skipped).toBe("already_delivered");
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("concurrent calls only send once", async () => {
    const { ids } = seed(1);
    const deps = okDeps();
    const [a, b] = await Promise.all([deliverPart(ids[0], deps), deliverPart(ids[0], deps)]);
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect([a.skipped, b.skipped]).toContain("in_progress");
  });

  it("never marks delivered without ok + message_id", async () => {
    const { ids } = seed(1);
    const out = await deliverPart(ids[0], { readVideo: async () => Buffer.from("v"), send: async () => ({ ok: true }) });
    expect(out.part.status).toBe("failed");
    expect(out.part.delivery_proof).toBeNull();
  });

  it("turns Telegram errors into plain language", async () => {
    const { ids } = seed(1);
    const out = await deliverPart(ids[0], { readVideo: async () => Buffer.from("v"), send: async () => ({ ok: false, error: "Bad Request: chat not found" }) });
    expect(out.part.error_message).toContain("Add the bot as an admin");
  });

  it("simulate_failure fails exactly one part, first try only", async () => {
    const { project, ids } = seed(3, { simulate_failure: true });
    const deps = okDeps();
    const results = [];
    for (const id of ids) results.push(await deliverPart(id, deps));
    expect(results.map((r) => r.part.status)).toEqual(["failed", "delivered", "delivered"]);
    expect(results[0].part.error_message).toBe(SIMULATED_FAILURE_MESSAGE);
    expect(getProject(project.id)!.status).toBe("failed");
    updatePart(ids[0], { status: "approved" });
    expect((await deliverPart(ids[0], deps)).part.status).toBe("delivered");
    expect(getProject(project.id)!.status).toBe("completed");
  });

  it("cancels instead of sending when the project was stopped", async () => {
    const { project, ids } = seed(2);
    const deps = okDeps();
    await deliverPart(ids[0], deps);
    expect(stopProject(project.id)).toBe(1);
    const out = await deliverPart(ids[1], deps);
    expect(out.part.status).toBe("cancelled");
    expect(getPart(ids[0])!.status).toBe("delivered");
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
});
