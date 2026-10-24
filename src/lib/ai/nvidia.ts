import { z } from "zod";

const BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
export const LLM_MODEL = process.env.NVIDIA_LLM_MODEL || "meta/llama-3.3-70b-instruct";

export function nvidiaKey() {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set. Add it to the app secrets and restart.");
  return key;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model did not return JSON");
  return JSON.parse(body.slice(start, end + 1));
}

async function chat(messages: { role: string; content: string }[]) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${nvidiaKey()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0.2, top_p: 0.7, max_tokens: 4096 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`NVIDIA LLM error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

/** Calls the LLM, parses JSON and validates it against `schema`, retrying once with the validation error. */
export async function structuredChat<T>(schema: z.ZodType<T>, system: string, user: string): Promise<T> {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
  const messages = [
    { role: "system", content: `${system}\n\nReply with ONLY a JSON object matching this JSON Schema, no prose:\n${jsonSchema}` },
    { role: "user", content: user },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await chat(
      attempt === 0
        ? messages
        : [...messages, { role: "user", content: `Your previous reply was invalid (${lastError}). Reply again with ONLY valid JSON matching the schema.` }],
    );
    try {
      return schema.parse(extractJson(content));
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 500) : String(err);
    }
  }
  throw new Error(`AI returned invalid JSON twice: ${lastError}`);
}
