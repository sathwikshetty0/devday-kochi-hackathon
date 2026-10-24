import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { spawn } from "node:child_process";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { nvidiaKey } from "./nvidia";

const ASR_SERVER = process.env.NVIDIA_ASR_SERVER || "grpc.nvcf.nvidia.com:443";
// openai/whisper-large-v3 on build.nvidia.com (multilingual, covers most Indian languages)
const ASR_FUNCTION_ID = process.env.NVIDIA_ASR_FUNCTION_ID || "b702f636-f60c-4a3d-a6f4-f3568c13bd7d";

const WHISPER_CODES: Record<string, string> = {
  Hindi: "hi", Malayalam: "ml", Tamil: "ta", Telugu: "te", Kannada: "kn", Bengali: "bn",
  Marathi: "mr", Gujarati: "gu", Punjabi: "pa", Urdu: "ur", English: "en",
  // Whisper has no Odia model; let it auto-detect. Mixed speech also auto-detects.
  Odia: "multi", Mixed: "multi",
};

export function whisperLanguageCode(language: string) {
  return WHISPER_CODES[language] || "multi";
}

type AsrClient = grpc.Client & {
  Recognize: (
    req: unknown,
    meta: grpc.Metadata,
    opts: grpc.CallOptions,
    cb: (err: grpc.ServiceError | null, res: { results?: { alternatives?: { transcript?: string }[] }[] }) => void,
  ) => void;
};

let client: AsrClient | null = null;
function asrClient(): AsrClient {
  if (client) return client;
  const protoDir = path.join(process.cwd(), "proto");
  const def = protoLoader.loadSync(path.join(protoDir, "riva/proto/riva_asr.proto"), {
    includeDirs: [protoDir],
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const pkg = grpc.loadPackageDefinition(def) as unknown as {
    nvidia: { riva: { asr: { RivaSpeechRecognition: new (addr: string, creds: grpc.ChannelCredentials) => AsrClient } } };
  };
  client = new pkg.nvidia.riva.asr.RivaSpeechRecognition(ASR_SERVER, grpc.credentials.createSsl());
  return client;
}

/** Extracts 16 kHz mono 16-bit PCM audio (raw, no header) from a video file buffer. */
export function extractPcm(video: Buffer): Promise<Buffer> {
  const bin = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"]);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      // A video with no audio track yields no PCM; treat as silence.
      if (code === 0 || /does not contain any stream|Output file is empty|matches no streams/i.test(stderr)) {
        resolve(Buffer.concat(chunks));
      } else reject(new Error(`ffmpeg failed to extract audio: ${stderr.slice(0, 300)}`));
    });
    proc.stdin.on("error", () => {});
    proc.stdin.end(video);
  });
}

/** Root-mean-square level of 16-bit PCM, used to skip silent parts without calling the API. */
export function pcmRms(pcm: Buffer) {
  const n = Math.floor(pcm.length / 2);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = pcm.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

function recognize(pcm: Buffer, languageCode: string): Promise<string> {
  const meta = new grpc.Metadata();
  meta.add("function-id", ASR_FUNCTION_ID);
  meta.add("authorization", `Bearer ${nvidiaKey()}`);
  const req = {
    config: {
      encoding: "LINEAR_PCM",
      sample_rate_hertz: 16000,
      language_code: languageCode,
      max_alternatives: 1,
      audio_channel_count: 1,
      enable_automatic_punctuation: true,
    },
    audio: pcm,
  };
  return new Promise((resolve, reject) => {
    asrClient().Recognize(req, meta, { deadline: Date.now() + 120_000 }, (err, res) => {
      if (err) return reject(new Error(`NVIDIA speech-to-text error: ${err.details || err.message}`));
      const text = (res.results || [])
        .map((r) => r.alternatives?.[0]?.transcript?.trim() || "")
        .filter(Boolean)
        .join(" ");
      resolve(text.trim());
    });
  });
}

export async function transcribeVideo(video: Buffer, language: string): Promise<string> {
  const pcm = await extractPcm(video);
  if (pcm.length < 16000 || pcmRms(pcm) < 0.003) return "";
  const code = whisperLanguageCode(language);
  try {
    return await recognize(pcm, code);
  } catch (err) {
    if (code !== "multi") return recognize(pcm, "multi");
    throw err;
  }
}
