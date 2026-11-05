import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import type {
  GetObjectResult,
  PutObjectInput,
  StorageProvider,
  StoredObject,
} from "./types";

const STORE_NAME = "documents";

export type DocumentBlobStore = {
  set: (
    key: string,
    data: ArrayBuffer | Blob | string,
    options?: { metadata?: Record<string, unknown> },
  ) => Promise<unknown>;
  get: (
    key: string,
    options: { type: "arrayBuffer"; consistency?: "strong" | "eventual" },
  ) => Promise<ArrayBuffer | null>;
};

export function defaultDocumentStore(): DocumentBlobStore {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

/**
 * Durable file storage for Netlify. The function bundle directory (`/var/task`)
 * is read-only, so `mkdir /var/task/storage` cannot succeed there.
 */
export class NetlifyBlobsStorageProvider implements StorageProvider {
  readonly name = "netlify-blobs";

  constructor(private readonly store: DocumentBlobStore = defaultDocumentStore()) {}

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const safeName = input.originalFilename
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 120);
    const storageKey = `${input.communityId}/${randomUUID()}-${safeName}`;
    const bytes = new Uint8Array(input.body);
    await this.store.set(storageKey, new Blob([bytes]), {
      metadata: {
        mimeType: input.mimeType,
        originalFilename: input.originalFilename,
      },
    });
    return {
      storageProvider: this.name,
      storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType || "application/octet-stream",
      size: input.body.byteLength,
    };
  }

  async getObject(storageKey: string): Promise<GetObjectResult> {
    const data = await this.store.get(storageKey, {
      type: "arrayBuffer",
      consistency: "strong",
    });
    if (!data) throw new Error(`Stored file not found: ${storageKey}`);
    return { body: Buffer.from(data) };
  }

  async getSignedUrl(): Promise<string | null> {
    return null;
  }
}
