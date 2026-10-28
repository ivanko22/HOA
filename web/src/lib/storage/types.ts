export type StoredObject = {
  storageProvider: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  size: number;
};

export type PutObjectInput = {
  /** Logical tenant/community partition for key prefixing. */
  communityId: string;
  originalFilename: string;
  mimeType: string;
  body: Buffer;
};

export type GetObjectResult = {
  body: Buffer;
  mimeType?: string;
  originalFilename?: string;
};

/**
 * Storage abstraction. App code must not persist public file URLs.
 * Access goes through authenticated endpoints or short-lived signed URLs.
 */
export interface StorageProvider {
  readonly name: string;
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(storageKey: string): Promise<GetObjectResult>;
  /** Optional: issue a time-limited URL (S3-compatible). Local may return null. */
  getSignedUrl?(storageKey: string, expiresInSeconds: number): Promise<string | null>;
  deleteObject?(storageKey: string): Promise<void>;
}
