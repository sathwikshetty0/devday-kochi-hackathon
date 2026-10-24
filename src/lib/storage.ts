import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

export const STORAGE_DIR = path.join(DATA_DIR, "storage");

function safeKey(key: string) {
  const normalized = path.posix.normalize(key).replace(/^\/+/, "");
  if (normalized.startsWith("..") || normalized.includes("\0")) throw new Error("Invalid storage key");
  return normalized;
}

export function storagePath(key: string) {
  return path.join(STORAGE_DIR, safeKey(key));
}

export function fileUrl(key: string) {
  return `/api/files/${safeKey(key)}`;
}

export function keyFromUrl(url: string) {
  return safeKey(url.replace(/^\/api\/files\//, ""));
}

export async function saveFile(key: string, data: Buffer | Uint8Array) {
  const p = storagePath(key);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, data);
  return fileUrl(key);
}

export async function readFileByUrl(url: string) {
  return fs.promises.readFile(storagePath(keyFromUrl(url)));
}

export async function deleteByUrl(url: string) {
  await fs.promises.rm(storagePath(keyFromUrl(url)), { force: true });
}

export async function deleteDir(key: string) {
  await fs.promises.rm(storagePath(key), { recursive: true, force: true });
}
