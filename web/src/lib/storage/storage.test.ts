import { describe, expect, it } from "vitest";
import { NetlifyBlobsStorageProvider } from "./netlify-blobs-storage-provider";
import type { DocumentBlobStore } from "./netlify-blobs-storage-provider";
import { isFatalStorageError, isFunctionRuntime, storageKindFromEnv } from "./index";

describe("storageKindFromEnv", () => {
  it("uses Netlify Blobs on the Lambda filesystem even without NETLIFY=true", () => {
    expect(
      storageKindFromEnv({ STORAGE_PROVIDER: "local" }, "/var/task"),
    ).toBe("netlify-blobs");
    expect(
      storageKindFromEnv(
        { AWS_LAMBDA_FUNCTION_NAME: "___netlify-server-handler" },
        "/tmp",
      ),
    ).toBe("netlify-blobs");
    expect(isFunctionRuntime({ LAMBDA_TASK_ROOT: "/var/task" }, "/opt")).toBe(
      true,
    );
  });

  it("uses Netlify Blobs on Netlify even when local is requested", () => {
    expect(storageKindFromEnv({ NETLIFY: "true" })).toBe("netlify-blobs");
    expect(
      storageKindFromEnv({ NETLIFY: "true", STORAGE_PROVIDER: "local" }),
    ).toBe("netlify-blobs");
  });

  it("keeps the local disk for a developer machine", () => {
    expect(storageKindFromEnv({})).toBe("local");
    expect(storageKindFromEnv({ STORAGE_PROVIDER: "local" })).toBe("local");
  });

  it("still honors an explicit s3 selection", () => {
    expect(
      storageKindFromEnv({ NETLIFY: "true", STORAGE_PROVIDER: "s3" }),
    ).toBe("s3");
  });
});

describe("isFatalStorageError", () => {
  it("recognizes the read-only function disk", () => {
    const err = new Error(
      "ENOENT: no such file or directory, mkdir '/var/task/storage'",
    );
    expect(isFatalStorageError(err)).toBe(true);
  });
});

describe("NetlifyBlobsStorageProvider", () => {
  it("writes and reads bytes without using the function disk", async () => {
    const objects = new Map<string, Uint8Array>();
    const store: DocumentBlobStore = {
      async set(key, data) {
        const buf =
          typeof data === "string"
            ? new TextEncoder().encode(data)
            : data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array(await data.arrayBuffer());
        objects.set(key, buf);
      },
      async get(key) {
        const found = objects.get(key);
        if (!found) return null;
        return found.buffer.slice(
          found.byteOffset,
          found.byteOffset + found.byteLength,
        ) as ArrayBuffer;
      },
    };
    const provider = new NetlifyBlobsStorageProvider(store);
    const stored = await provider.putObject({
      communityId: "community-1",
      originalFilename: "Minutes Sep 2026.pdf",
      mimeType: "application/pdf",
      body: Buffer.from("pdf-bytes"),
    });
    expect(stored.storageProvider).toBe("netlify-blobs");
    expect(stored.storageKey.startsWith("community-1/")).toBe(true);
    expect(stored.storageKey.startsWith("/")).toBe(false);
    const loaded = await provider.getObject(stored.storageKey);
    expect(loaded.body.toString()).toBe("pdf-bytes");
  });
});
