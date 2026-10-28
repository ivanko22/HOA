import { LocalStorageProvider } from "./local-storage-provider";
import { S3CompatibleStorageProvider } from "./s3-compatible-storage-provider";
import type { StorageProvider } from "./types";

export type { StorageProvider, StoredObject, PutObjectInput } from "./types";
export { LocalStorageProvider } from "./local-storage-provider";
export { S3CompatibleStorageProvider } from "./s3-compatible-storage-provider";

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  const kind = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  if (kind === "s3") {
    cached = new S3CompatibleStorageProvider({
      bucket: process.env.S3_BUCKET ?? "",
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
  } else {
    cached = new LocalStorageProvider();
  }
  return cached;
}

/** @deprecated Prefer getStorageProvider().putObject / getObject */
export async function storeDocumentFile(params: {
  communityId: string;
  originalFilename: string;
  bytes: Buffer;
  mimeType?: string;
}) {
  const stored = await getStorageProvider().putObject({
    communityId: params.communityId,
    originalFilename: params.originalFilename,
    mimeType: params.mimeType ?? "application/octet-stream",
    body: params.bytes,
  });
  return {
    storageKey: stored.storageKey,
    storageProvider: stored.storageProvider,
    absolutePath: stored.storageKey,
  };
}

export async function readDocumentFile(storageKey: string) {
  const result = await getStorageProvider().getObject(storageKey);
  return result.body;
}
