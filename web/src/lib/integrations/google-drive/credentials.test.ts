import { afterEach, describe, expect, it } from "vitest";
import {
  getGoogleDriveCredentialsStatus,
  parseServiceAccountJson,
} from "./credentials";
import { GoogleDriveConfigError } from "./types";

const keys = [
  "GOOGLE_DRIVE_API_KEY",
  "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
] as const;

describe("getGoogleDriveCredentialsStatus", () => {
  const previous: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  });

  function clearAll() {
    for (const k of keys) {
      previous[k] = process.env[k];
      delete process.env[k];
    }
  }

  it("lists missing env vars when none are set", () => {
    clearAll();
    const status = getGoogleDriveCredentialsStatus();
    expect(status.ok).toBe(false);
    expect(status.missing).toContain("GOOGLE_DRIVE_API_KEY");
    expect(status.missing).toContain("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");
  });

  it("accepts API key mode", () => {
    clearAll();
    process.env.GOOGLE_DRIVE_API_KEY = "test-key";
    const status = getGoogleDriveCredentialsStatus();
    expect(status.ok).toBe(true);
    expect(status.mode).toBe("api_key");
  });
});

describe("parseServiceAccountJson", () => {
  it("turns escaped newlines in the private key into real newlines", () => {
    const parsed = parseServiceAccountJson(
      JSON.stringify({
        client_email: "sync@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
        token_uri: "https://oauth2.googleapis.com/token",
      }),
    );
    expect(parsed.client_email).toBe("sync@example.iam.gserviceaccount.com");
    expect(parsed.private_key).toBe(
      "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n",
    );
    expect(parsed.token_uri).toBe("https://oauth2.googleapis.com/token");
  });

  it("rejects invalid JSON as a config error", () => {
    expect(() => parseServiceAccountJson("{")).toThrow(GoogleDriveConfigError);
  });
});
