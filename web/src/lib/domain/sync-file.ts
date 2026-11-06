/** Files the sync will store. Anything else keeps its Drive metadata and link. */
export const MAX_SYNC_FILE_BYTES = 12 * 1024 * 1024;

export type SyncSkipStatus =
  | "unsupported"
  | "oversized"
  | "pending_transcription";

export type SyncFilePlan =
  | { action: "download" }
  | { action: "skip"; status: SyncSkipStatus; reason: string };

const AUDIO_EXT = /\.(m4a|mp3|wav|aac|ogg|flac|wma|aiff)$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|wmv)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|tif|tiff|bmp)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|exe|dmg|iso|pst|pkg)$/i;

export function isAudioFile(name: string, mimeType?: string | null): boolean {
  if (AUDIO_EXT.test(name)) return true;
  const mime = (mimeType ?? "").toLowerCase();
  return mime.startsWith("audio/") || mime === "application/vnd.google-apps.audio";
}

export function isVideoFile(name: string, mimeType?: string | null): boolean {
  if (AUDIO_EXT.test(name)) return false;
  if (VIDEO_EXT.test(name)) return true;
  const mime = (mimeType ?? "").toLowerCase();
  return mime.startsWith("video/") || mime === "application/vnd.google-apps.video";
}

export function isImageFile(name: string, mimeType?: string | null): boolean {
  if (IMAGE_EXT.test(name)) return true;
  return (mimeType ?? "").toLowerCase().startsWith("image/");
}

export function driveWebViewLink(
  fileId: string,
  webViewLink?: string | null,
): string {
  const link = webViewLink?.trim();
  if (link) return link;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function sizeNote(sizeBytes: number | null): string {
  if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return " It was not downloaded.";
  }
  const mb = Math.max(1, Math.round(sizeBytes / (1024 * 1024)));
  return ` It is about ${mb} MB and was not downloaded.`;
}

/**
 * Decide whether a Drive file is stored or left on Drive.
 * Audio is never downloaded: meeting recordings were failing the sync and
 * must not be parsed as PDFs. Oversized files and formats this app cannot
 * read are skips with a reason, not synchronization failures.
 */
export function classifySyncFile(input: {
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  maxBytes?: number;
}): SyncFilePlan {
  const maxBytes = input.maxBytes ?? MAX_SYNC_FILE_BYTES;
  const size =
    input.sizeBytes != null && Number.isFinite(input.sizeBytes)
      ? input.sizeBytes
      : null;

  if (isAudioFile(input.name, input.mimeType)) {
    return {
      action: "skip",
      status: "pending_transcription",
      reason: `Audio recording stays on Google Drive for later transcription.${sizeNote(size)} Open the original file on Google Drive. Transcription is not available in this sync.`,
    };
  }

  if (
    isVideoFile(input.name, input.mimeType) ||
    isImageFile(input.name, input.mimeType) ||
    ARCHIVE_EXT.test(input.name)
  ) {
    return {
      action: "skip",
      status: "unsupported",
      reason:
        "This file type is not imported into Community OS. The original stays on Google Drive — open it there. It was not parsed as a document.",
    };
  }

  if (size != null && size > maxBytes) {
    const mb = Math.max(1, Math.round(size / (1024 * 1024)));
    return {
      action: "skip",
      status: "oversized",
      reason: `This file is about ${mb} MB, over the 12 MB sync limit, so it was not downloaded. Open it on Google Drive.`,
    };
  }

  return { action: "download" };
}
