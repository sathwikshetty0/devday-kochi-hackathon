export const CONTENT_TYPES = ["Web series", "Vlog or challenge", "Podcast", "Tutorial", "Other"] as const;
export const LANGUAGES = [
  "Hindi", "Malayalam", "Tamil", "Telugu", "Kannada", "Bengali", "Marathi",
  "Gujarati", "Punjabi", "Odia", "Urdu", "English", "Mixed",
] as const;

export type ProjectStatus =
  | "draft" | "splitting" | "review" | "awaiting_approval"
  | "delivering" | "completed" | "stopped" | "failed";

export type PartStatus =
  | "queued" | "awaiting_approval" | "approved" | "delivering"
  | "delivered" | "failed" | "cancelled";

export interface Project {
  id: string;
  title: string;
  content_type: string;
  language: string;
  original_video_url: string | null;
  part_length_seconds: number;
  merge_short_last: boolean;
  add_part_badge: boolean;
  crop_9_16: boolean;
  simulate_failure: boolean;
  failure_simulated: boolean;
  send_important_only: boolean;
  status: ProjectStatus;
  rights_confirmed: boolean;
  ai_summary: string | null;
  created_date: string;
  part_count?: number;
}

export interface Part {
  id: string;
  project_id: string;
  part_number: number;
  total_parts: number;
  title: string;
  caption: string;
  hashtags: string[];
  video_url: string;
  start_seconds: number;
  duration_seconds: number;
  order: number;
  status: PartStatus;
  delivery_method: string | null;
  delivery_proof: string | null;
  error_message: string | null;
  idempotency_key: string;
  transcript: string | null;
  ai_score: number | null;
  ai_important: boolean;
  ai_reason: string | null;
  attempts: number;
  file_size: number | null;
}

export interface ActivityLog {
  id: string;
  project_id: string;
  part_id: string | null;
  event: string;
  detail: string | null;
  timestamp: string;
}

export interface ProjectBundle {
  project: Project;
  parts: Part[];
  logs: ActivityLog[];
}

export function partTitle(title: string, n: number, total: number) {
  return `${title} - Part ${n}/${total}`;
}
