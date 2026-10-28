import type {
  GetObjectResult,
  PutObjectInput,
  StorageProvider,
  StoredObject,
} from "./types";

/**
 * Placeholder for staging/production object storage (S3, R2, MinIO, etc.).
 * Configure via STORAGE_PROVIDER=s3 and S3_* env vars — not implemented in this milestone.
 */
export class S3CompatibleStorageProvider implements StorageProvider {
  readonly name = "s3";

  constructor(
    private readonly config: {
      bucket: string;
      region: string;
      endpoint?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      forcePathStyle?: boolean;
    },
  ) {}

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    void input;
    void this.config;
    throw new Error(
      "S3CompatibleStorageProvider is not configured yet. Use STORAGE_PROVIDER=local in development.",
    );
  }

  async getObject(storageKey: string): Promise<GetObjectResult> {
    void storageKey;
    throw new Error(
      "S3CompatibleStorageProvider is not configured yet. Use STORAGE_PROVIDER=local in development.",
    );
  }

  async getSignedUrl(
    storageKey: string,
    expiresInSeconds: number,
  ): Promise<string | null> {
    void storageKey;
    void expiresInSeconds;
    throw new Error(
      "S3CompatibleStorageProvider is not configured yet. Use STORAGE_PROVIDER=local in development.",
    );
  }
}
