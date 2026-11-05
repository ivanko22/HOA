import { LocalStorageProvider } from "./local-storage-provider";
import { NetlifyBlobsStorageProvider } from "./netlify-blobs-storage-provider";
import { S3CompatibleStorageProvider } from "./s3-compatible-storage-provider";
import type { StorageProvider } from "./types";

export type { StorageProvider, StoredObject, PutObjectInput } from "./types";
export { LocalStorageProvider } from "./local-storage-provider";
export { NetlifyBlobsStorageProvider } from "./netlify-blobs-storage-provider";
export { S3CompatibleStorageProvider } from "./s3-compatible-storage-provider";

export type StorageKind = "local" | "s3" | "netlify-blobs";

/**
 * Netlify's Next.js server does not always set `NETLIFY=true`, but it still
 * runs in the read-only Lambda filesystem (`/var/task`). That runtime must
 * use Netlify Blobs. `STORAGE_PROVIDER=local` is ignored there.
 */
function readEnv(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Real process cwd. The comment keeps the bundler from baking the build directory. */
function runtimeCwd(): string {
  return /*turbopackIgnore: true*/ process.cwd();
}

export function isFunctionRuntime(
  env: Record<string, string | undefined>,
  cwd = "",
): boolean {
  const netlify = readEnv(env, "NETLIFY");
  if (netlify === "true" || netlify === "1") return true;
  if (
    readEnv(env, "AWS_LAMBDA_FUNCTION_NAME") ||
    readEnv(env, "LAMBDA_TASK_ROOT") ||
    readEnv(env, "AWS_EXECUTION_ENV")
  ) {
    return true;
  }
  return cwd === "/var/task" || cwd.startsWith("/var/task/");
}

export function storageKindFromEnv(
  env: Record<string, string | undefined> = process.env,
  cwd = runtimeCwd(),
): StorageKind {
  const kind = (readEnv(env, "STORAGE_PROVIDER") ?? "").trim().toLowerCase();
  if (kind === "s3") return "s3";
  if (kind === "blobs" || kind === "netlify-blobs") return "netlify-blobs";
  if (isFunctionRuntime(env, cwd)) return "netlify-blobs";
  return "local";
}

export function isFatalStorageError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /ENOENT:.*mkdir/i.test(message) ||
    message.includes("EACCES") ||
    message.includes("EROFS") ||
    message.includes("read-only file system") ||
    message.includes("S3CompatibleStorageProvider is not configured") ||
    message.includes("not been configured to use Netlify Blobs")
  );
}

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  const kind = storageKindFromEnv();
  if (kind === "s3") {
    cached = new S3CompatibleStorageProvider({
      bucket: process.env.S3_BUCKET ?? "",
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
  } else if (kind === "netlify-blobs") {
    cached = new NetlifyBlobsStorageProvider();
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
