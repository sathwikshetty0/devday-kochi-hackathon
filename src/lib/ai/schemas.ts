import { z } from "zod";

export const AnalysisSchema = z.object({
  summary: z.string(),
  parts: z.array(
    z.object({
      part_number: z.number().int(),
      score: z.number().min(0).max(100),
      important: z.boolean(),
      reason: z.string(),
    }),
  ),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const CaptionsSchema = z.object({
  series_title: z.string().min(1),
  parts: z.array(
    z.object({
      part_number: z.number().int(),
      caption: z.string().min(1),
      hashtags: z.array(z.string().min(1)).min(3).max(5),
    }),
  ),
});
export type Captions = z.infer<typeof CaptionsSchema>;
