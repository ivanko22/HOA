import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT =
  process.env.DOCUMENT_STORAGE_ROOT ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "documents");

export function documentStorageRoot() {
  return ROOT;
}

export async function storeDocumentFile(params: {
  communityId: string;
  originalFilename: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; absolutePath: string }> {
  const safeName = params.originalFilename
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 120);
  const storageKey = path.posix.join(
    params.communityId,
    `${randomUUID()}-${safeName}`,
  );
  const absolutePath = path.join(/*turbopackIgnore: true*/ ROOT, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ absolutePath, params.bytes);
  return { storageKey, absolutePath };
}

export async function readDocumentFile(storageKey: string): Promise<Buffer> {
  const absolutePath = path.join(/*turbopackIgnore: true*/ ROOT, storageKey);
  await access(/*turbopackIgnore: true*/ absolutePath);
  return readFile(/*turbopackIgnore: true*/ absolutePath);
}

export function absoluteDocumentPath(storageKey: string): string {
  return path.join(/*turbopackIgnore: true*/ ROOT, storageKey);
}
