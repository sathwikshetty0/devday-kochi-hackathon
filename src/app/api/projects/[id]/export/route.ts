import fs from "node:fs";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { HttpError, handle, requireProject, type Ctx } from "@/lib/api";
import { getParts } from "@/lib/db";
import { captionsCsv } from "@/lib/export";
import { keyFromUrl, storagePath } from "@/lib/storage";

export const runtime = "nodejs";

export const GET = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const project = requireProject(id);
  const parts = getParts(id);
  if (!parts.length) throw new HttpError(400, "There are no parts to download yet.");
  const archive = new ZipArchive({ zlib: { level: 0 } });
  for (const p of parts) {
    archive.append(fs.createReadStream(storagePath(keyFromUrl(p.video_url))), { name: `part_${String(p.part_number).padStart(2, "0")}.mp4` });
  }
  archive.append(captionsCsv(parts), { name: "captions.csv" });
  void archive.finalize();
  const slug = project.title.replace(/[^\w-]+/g, "_").slice(0, 60) || "reelix";
  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}_parts.zip"`,
    },
  });
});
