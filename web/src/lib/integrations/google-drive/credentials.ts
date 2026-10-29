import type { DriveCredentialsStatus } from "./types";

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
