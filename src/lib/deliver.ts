import { logActivity } from "./activity";
import { db, getPart, getParts, getProject, updatePart, updateProject } from "./db";
import { readFileByUrl, storagePath, keyFromUrl } from "./storage";
import { buildCaption, friendlyTelegramError, sendVideo, type TelegramResult } from "./telegram";
import { publishToInstagram } from "./publishers/instagram";
import { publishToYouTube } from "./publishers/youtube";
import type { DeliveryChannel, PublishResult } from "./publishers/types";
import type { Part } from "./types";

export interface DeliverDeps {
  send: (opts: { video: Buffer; filename: string; caption: string }) => Promise<TelegramResult>;
  readVideo: (url: string) => Promise<Buffer>;
  sendInstagram?: (payload: any) => Promise<PublishResult>;
  sendYouTube?: (payload: any) => Promise<PublishResult>;
}

const defaultDeps: DeliverDeps = {
  send: sendVideo,
  readVideo: readFileByUrl,
  sendInstagram: publishToInstagram,
  sendYouTube: publishToYouTube,
};

export const SKIPPED_NOT_IMPORTANT = "Skipped: not marked important.";

export const SIMULATED_FAILURE_MESSAGE =
  "Simulated failure: Telegram didn't confirm this part, so it was NOT marked as delivered. Next step: Press Retry to send it again.";

export interface DeliverOutcome {
  part: Part;
  skipped?: "already_delivered" | "in_progress" | "not_approved" | "cancelled";
}

/** Recomputes the project status once nothing is left to send. */
export function settleProject(projectId: string) {
  const project = getProject(projectId);
  if (!project || project.status === "stopped") return;
  const parts = getParts(projectId);
  const pending = parts.some((p) => ["approved", "delivering"].includes(p.status));
  if (pending) return;
  const anyFailed = parts.some((p) => p.status === "failed");
  const next = anyFailed ? "failed" : "completed";
  if (project.status !== next) {
    updateProject(projectId, { status: next });
    logActivity(
      projectId,
      null,
      anyFailed ? "Series finished with failures" : "Series delivered",
      anyFailed ? "Some parts failed. See Result for next steps." : "Every approved part has Telegram proof.",
    );
  }
}

export async function deliverPart(partId: string, deps: DeliverDeps = defaultDeps): Promise<DeliverOutcome> {
  const part = getPart(partId);
  if (!part) throw new Error("Part not found");
  const project = getProject(part.project_id);
  if (!project) throw new Error("Project not found");
  const label = `Part ${part.part_number}/${part.total_parts}`;

  if (part.status === "delivered") {
    logActivity(project.id, part.id, "Skipped (already delivered)", `${label} already has proof: message ${part.delivery_proof}`);
    return { part, skipped: "already_delivered" };
  }

  if (project.status === "stopped") {
    if (!["delivered", "cancelled"].includes(part.status)) {
      updatePart(part.id, { status: "cancelled", error_message: "Cancelled: you pressed Stop." });
      logActivity(project.id, part.id, "Cancelled", `${label} cancelled because the series was stopped`);
    }
    return { part: getPart(part.id)!, skipped: "cancelled" };
  }

  if (part.status !== "approved") {
    return { part, skipped: part.status === "delivering" ? "in_progress" : "not_approved" };
  }

  // Atomic lock: only one caller can move this part from approved -> delivering.
  const lock = db()
    .prepare(`UPDATE parts SET status = 'delivering', attempts = attempts + 1, error_message = NULL
              WHERE id = ? AND status = 'approved'`)
    .run(part.id);
  if (lock.changes === 0) return { part: getPart(part.id)!, skipped: "in_progress" };
  logActivity(project.id, part.id, "Sending", `${label} locked for delivery (key ${part.idempotency_key.slice(0, 8)})`);

  const fail = (message: string, event = "Failed") => {
    updatePart(part.id, { status: "failed", error_message: message });
    logActivity(project.id, part.id, event, `${label}: ${message}`);
    settleProject(project.id);
    return { part: getPart(part.id)! };
  };

  if (project.simulate_failure && !project.failure_simulated) {
    const claimed = db()
      .prepare("UPDATE projects SET failure_simulated = 1 WHERE id = ? AND failure_simulated = 0")
      .run(project.id);
    if (claimed.changes === 1) return fail(SIMULATED_FAILURE_MESSAGE, "Failed (simulated)");
  }

  let video: Buffer;
  try {
    video = await deps.readVideo(part.video_url);
  } catch {
    return fail("The video file for this part is missing from storage. Next step: Split the video again, then retry.");
  }
  const channel = (project.delivery_channel || "telegram") as DeliveryChannel;
  const filename = `part_${String(part.part_number).padStart(2, "0")}.mp4`;
  const filePath = storagePath(keyFromUrl(part.video_url));

  if (channel === "instagram") {
    logActivity(project.id, part.id, "Publishing to Instagram", `${label} via Playwright Browser Bot`);
    const fn = deps.sendInstagram || publishToInstagram;
    const igResult = await fn({
      videoBuffer: video,
      videoFilePath: filePath,
      filename,
      title: part.title,
      caption: part.caption,
      hashtags: part.hashtags,
    });
    if (igResult.ok && igResult.proofId) {
      updatePart(part.id, {
        status: "delivered",
        delivery_method: "instagram",
        delivery_proof: igResult.proofUrl || igResult.proofId,
        error_message: null,
      });
      logActivity(project.id, part.id, "Delivered", `${label} published to Instagram Reels: ${igResult.proofUrl || igResult.proofId}`);
      settleProject(project.id);
      return { part: getPart(part.id)! };
    }
    return fail(igResult.error || "Instagram publication failed");
  }

  if (channel === "youtube") {
    logActivity(project.id, part.id, "Publishing to YouTube Shorts", `${label} via Playwright Browser Bot`);
    const fn = deps.sendYouTube || publishToYouTube;
    const ytResult = await fn({
      videoBuffer: video,
      videoFilePath: filePath,
      filename,
      title: part.title,
      caption: part.caption,
      hashtags: part.hashtags,
    });
    if (ytResult.ok && ytResult.proofId) {
      updatePart(part.id, {
        status: "delivered",
        delivery_method: "youtube",
        delivery_proof: ytResult.proofUrl || ytResult.proofId,
        error_message: null,
      });
      logActivity(project.id, part.id, "Delivered", `${label} published to YouTube Shorts: ${ytResult.proofUrl || ytResult.proofId}`);
      settleProject(project.id);
      return { part: getPart(part.id)! };
    }
    return fail(ytResult.error || "YouTube Shorts publication failed");
  }

  logActivity(project.id, part.id, "Uploading to Telegram", `${label} (${(video.length / 1024 / 1024).toFixed(1)} MB)`);

  const result = await deps.send({
    video,
    filename,
    caption: buildCaption(part.title, part.caption, part.hashtags),
  });

  if (result.ok && typeof result.messageId === "number") {
    updatePart(part.id, {
      status: "delivered",
      delivery_method: "telegram",
      delivery_proof: String(result.messageId),
      error_message: null,
    });
    logActivity(project.id, part.id, "Delivered", `${label} confirmed by Telegram: message_id ${result.messageId}`);
    settleProject(project.id);
    return { part: getPart(part.id)! };
  }

  return fail(friendlyTelegramError(result.error || "No message_id returned"));
}

export function stopProject(projectId: string) {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");
  const res = db()
    .prepare(`UPDATE parts SET status = 'cancelled', error_message = 'Cancelled: you pressed Stop.'
              WHERE project_id = ? AND status IN ('queued', 'awaiting_approval', 'approved')`)
    .run(projectId);
  updateProject(projectId, { status: "stopped" });
  logActivity(projectId, null, "Stopped", `Stop pressed. ${res.changes} part(s) still waiting were cancelled.`);
  return res.changes;
}
