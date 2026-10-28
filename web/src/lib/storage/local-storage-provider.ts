import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  GetObjectResult,
  PutObjectInput,
  StorageProvider,
  StoredObject,
} from "./types";

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  constructor(
    private readonly root =
      process.env.DOCUMENT_STORAGE_ROOT ??
      path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "documents"),
  ) {}

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const safeName = input.originalFilename
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 120);
    const storageKey = path.posix.join(
      input.communityId,
      `${randomUUID()}-${safeName}`,
    );
    const absolutePath = path.join(/*turbopackIgnore: true*/ this.root, storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ absolutePath, input.body);
    return {
      storageProvider: this.name,
      storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType || "application/octet-stream",
      size: input.body.byteLength,
    };
  }

  async getObject(storageKey: string): Promise<GetObjectResult> {
    const absolutePath = path.join(/*turbopackIgnore: true*/ this.root, storageKey);
    await access(/*turbopackIgnore: true*/ absolutePath);
    const body = await readFile(/*turbopackIgnore: true*/ absolutePath);
    return { body };
  }

  async getSignedUrl(): Promise<string | null> {
    // Local files are served only via authenticated app routes.
    return null;
  }
}
