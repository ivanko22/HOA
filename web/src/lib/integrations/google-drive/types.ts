export type DriveCredentialsStatus = {
  ok: boolean;
  mode: "api_key" | "service_account" | "none";
  missing: string[];
};

export type DriveListedItem = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
  version?: string;
  webViewLink?: string;
  trashed?: boolean;
};

export type DriveTreeNode = DriveListedItem & {
  path: string;
  isFolder: boolean;
  children?: DriveTreeNode[];
};

export class GoogleDriveConfigError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(
      `Google Drive credentials missing: ${missing.join(", ")}. Set these environment variables to sync.`,
    );
    this.name = "GoogleDriveConfigError";
    this.missing = missing;
  }
}
