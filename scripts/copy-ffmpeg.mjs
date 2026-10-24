import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public/ffmpeg", { recursive: true });
for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  cpSync(`node_modules/@ffmpeg/core/dist/umd/${f}`, `public/ffmpeg/${f}`);
}
