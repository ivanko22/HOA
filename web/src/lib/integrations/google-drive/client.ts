import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  getGoogleDriveCredentialsStatus,
  parseServiceAccountJson,
} from "./credentials";
import {
  GoogleDriveConfigError,
  type DriveListedItem,
  type DriveTreeNode,
} from "./types";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_FIELDS =
  "nextPageToken,files(id,name,mimeType,parents,modifiedTime,size,md5Checksum,version,webViewLink,trashed)";

/** Google (and the Netlify gateway in front of it) uses these for transient faults. */
const RETRYABLE_DRIVE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_DRIVE_ATTEMPTS = 4;
const MAX_RETRY_DELAY_MS = 2_000;

function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function driveRetryDelayMs(
  attempt: number,
  response: Response,
  random: () => number = Math.random,
): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  const backoff = 200 * 2 ** attempt;
  const jitter = Math.floor(random() * 100);
  return Math.min(backoff + jitter, MAX_RETRY_DELAY_MS);
}

/** Retry transient Drive/token responses. Non-retryable statuses return immediately. */
export async function withDriveRetries(
  send: () => Promise<Response>,
  opts?: {
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
  },
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? MAX_DRIVE_ATTEMPTS;
  const sleep = opts?.sleep ?? defaultSleep;
  const random = opts?.random ?? Math.random;
  let last: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await send();
    if (res.ok || !RETRYABLE_DRIVE_STATUSES.has(res.status)) return res;
    last = res;
    if (attempt === maxAttempts - 1) break;
    await sleep(driveRetryDelayMs(attempt, res, random));
  }
  return last as Response;
}

async function responseErrorSnippet(res: Response): Promise<string> {
  try {
    const text = (await res.text()).replace(/\s+/g, " ").trim();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}

type TokenCache = { accessToken: string; expiresAtMs: number };
let cachedSaToken: TokenCache | null = null;

async function getAccessToken(): Promise<{
  mode: "api_key" | "service_account";
  apiKey?: string;
  accessToken?: string;
}> {
  const status = getGoogleDriveCredentialsStatus();
  if (!status.ok) throw new GoogleDriveConfigError(status.missing);

  if (status.mode === "api_key") {
    return { mode: "api_key", apiKey: process.env.GOOGLE_DRIVE_API_KEY!.trim() };
  }

  const now = Date.now();
  if (cachedSaToken && cachedSaToken.expiresAtMs > now + 60_000) {
    return { mode: "service_account", accessToken: cachedSaToken.accessToken };
  }

  let raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    raw = readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
  }
  if (!raw) throw new GoogleDriveConfigError(["GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON"]);

  const sa = parseServiceAccountJson(raw);

  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      exp: Math.floor(now / 1000) + 3600,
      iat: Math.floor(now / 1000),
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(sa.private_key, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const tokenRes = await withDriveRetries(() =>
    fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    }),
  );
  if (!tokenRes.ok) {
    throw new Error(
      `Google service-account token exchange failed: ${tokenRes.status} ${await responseErrorSnippet(tokenRes)}`,
    );
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedSaToken = {
    accessToken: tokenJson.access_token,
    expiresAtMs: now + tokenJson.expires_in * 1000,
  };
  return { mode: "service_account", accessToken: tokenJson.access_token };
}

async function driveFetch(
  path: string,
  init?: RequestInit & { raw?: boolean },
): Promise<Response> {
  const auth = await getAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  return withDriveRetries(() => {
    const attemptHeaders = new Headers(init?.headers);
    if (auth.mode === "api_key") {
      url.searchParams.set("key", auth.apiKey!);
    } else {
      attemptHeaders.set("Authorization", `Bearer ${auth.accessToken}`);
    }
    return fetch(url, { ...init, headers: attemptHeaders });
  });
}

export async function listDriveChildren(
  folderId: string,
): Promise<DriveListedItem[]> {
  const files: DriveListedItem[] = [];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent(
      `'${folderId}' in parents and trashed = false`,
    );
    let path = `files?q=${q}&fields=${encodeURIComponent(DRIVE_FIELDS)}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) path += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await driveFetch(path);
    if (!res.ok) {
      throw new Error(
        `Drive list failed (${res.status}): ${await responseErrorSnippet(res)}`,
      );
    }
    const json = (await res.json()) as {
      files?: DriveListedItem[];
      nextPageToken?: string;
    };
    files.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return files;
}

/** Recursively enumerate every file under a folder (including nested folders). */
export async function listDriveTree(
  rootFolderId: string,
  rootName = "root",
): Promise<DriveTreeNode[]> {
  const flat: DriveTreeNode[] = [];

  async function walk(folderId: string, pathPrefix: string) {
    const children = await listDriveChildren(folderId);
    for (const child of children) {
      const isFolder = child.mimeType === FOLDER_MIME;
      const path = `${pathPrefix}/${child.name}`.replace(/\/+/g, "/");
      const node: DriveTreeNode = {
        ...child,
        path,
        isFolder,
      };
      flat.push(node);
      if (isFolder) {
        await walk(child.id, path);
      }
    }
  }

  flat.push({
    id: rootFolderId,
    name: rootName,
    mimeType: FOLDER_MIME,
    path: `/${rootName}`,
    isFolder: true,
  });
  await walk(rootFolderId, `/${rootName}`);
  return flat;
}

export async function downloadDriveFile(file: {
  id: string;
  mimeType: string;
  name: string;
}): Promise<{ bytes: Buffer; mimeType: string; filename: string }> {
  const googleNative = file.mimeType.startsWith("application/vnd.google-apps.");
  if (googleNative) {
    const exportMap: Record<string, { mime: string; ext: string }> = {
      "application/vnd.google-apps.document": {
        mime: "application/pdf",
        ext: "pdf",
      },
      "application/vnd.google-apps.spreadsheet": {
        mime: "text/csv",
        ext: "csv",
      },
      "application/vnd.google-apps.presentation": {
        mime: "application/pdf",
        ext: "pdf",
      },
    };
    const mapped = exportMap[file.mimeType] ?? {
      mime: "application/pdf",
      ext: "pdf",
    };
    const res = await driveFetch(
      `files/${file.id}/export?mimeType=${encodeURIComponent(mapped.mime)}`,
    );
    if (!res.ok) {
      throw new Error(
        `Drive export failed for ${file.name}: ${res.status} ${await responseErrorSnippet(res)}`,
      );
    }
    const ab = await res.arrayBuffer();
    const base = file.name.replace(/\.[^.]+$/, "");
    return {
      bytes: Buffer.from(ab),
      mimeType: mapped.mime,
      filename: `${base}.${mapped.ext}`,
    };
  }

  const res = await driveFetch(`files/${file.id}?alt=media`);
  if (!res.ok) {
    throw new Error(
      `Drive download failed for ${file.name}: ${res.status} ${await responseErrorSnippet(res)}`,
    );
  }
  const ab = await res.arrayBuffer();
  return {
    bytes: Buffer.from(ab),
    mimeType: file.mimeType || "application/octet-stream",
    filename: file.name,
  };
}

export { FOLDER_MIME };
