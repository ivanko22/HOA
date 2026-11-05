import { GoogleDriveConfigError, type DriveCredentialsStatus } from "./types";

export function getGoogleDriveCredentialsStatus(): DriveCredentialsStatus {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
  const saJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (saJson || saPath) {
    return { ok: true, mode: "service_account", missing: [] };
  }
  if (apiKey) {
    return { ok: true, mode: "api_key", missing: [] };
  }
  return {
    ok: false,
    mode: "none",
    missing: [
      "GOOGLE_DRIVE_API_KEY",
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
      // or GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON file
    ],
  };
}

/**
 * Parse a service-account JSON env value.
 * Netlify often stores the PEM with escaped newlines (`\\n`). Those must be
 * real newlines before signing, or the token request crashes the function.
 */
export function parseServiceAccountJson(raw: string): {
  client_email: string;
  private_key: string;
  token_uri?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new GoogleDriveConfigError(["GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON"]);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new GoogleDriveConfigError(["GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON"]);
  }
  const sa = parsed as {
    client_email?: unknown;
    private_key?: unknown;
    token_uri?: unknown;
  };
  if (typeof sa.client_email !== "string" || typeof sa.private_key !== "string") {
    throw new GoogleDriveConfigError(["GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON"]);
  }
  return {
    client_email: sa.client_email,
    private_key: sa.private_key.replace(/\\n/g, "\n"),
    token_uri: typeof sa.token_uri === "string" ? sa.token_uri : undefined,
  };
}
