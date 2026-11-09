import { classifyDriveDocument, extractYears } from "./drive-classify";
import { driveWebViewLink, isAudioFile, isVideoFile } from "./sync-file";

export type MinutesFile = {
  id: string;
  name: string;
  path: string;
  isFolder?: boolean | number | null;
  mimeType?: string | null;
  webViewLink?: string | null;
  documentId?: string | null;
};

export type MinutesMatch = {
  name: string;
  path: string;
  driveFileId: string;
  webViewLink: string;
  documentId?: string;
  kind: "minutes" | "recording";
};

export type MinutesYearAvailability = {
  year: number;
  status: "available" | "recordings_only" | "not_found_in_sync" | "missing_expected";
  note: string;
  documents: MinutesMatch[];
};

const TRACKED_YEARS = [2024, 2025, 2026];

function isFolder(file: MinutesFile): boolean {
  return file.isFolder === true || file.isFolder === 1;
}

/**
 * A year is available only when a non-audio minutes file can be named.
 * Recordings in a minutes folder are listed, and they do not count as minutes.
 */
export function minutesAvailability(
  files: MinutesFile[],
  years: number[] = TRACKED_YEARS,
): { years: MinutesYearAvailability[]; undated: MinutesMatch[] } {
  const matches = new Map<number, MinutesMatch[]>();
  const undated: MinutesMatch[] = [];

  for (const file of files) {
    if (isFolder(file)) continue;
    const classification = classifyDriveDocument({
      name: file.name,
      path: file.path,
      mimeType: file.mimeType,
    });
    if (classification.label !== "Meeting Minutes") continue;
    const recording =
      isAudioFile(file.name, file.mimeType) || isVideoFile(file.name, file.mimeType);
    const match: MinutesMatch = {
      name: file.name,
      path: file.path,
      driveFileId: file.id,
      webViewLink: driveWebViewLink(file.id, file.webViewLink),
      documentId: file.documentId ?? undefined,
      kind: recording ? "recording" : "minutes",
    };
    const foundYears = extractYears(`${file.path} ${file.name}`);
    if (foundYears.length === 0) {
      undated.push(match);
      continue;
    }
    for (const year of foundYears) {
      const list = matches.get(year) ?? [];
      list.push(match);
      matches.set(year, list);
    }
  }

  return {
    years: years.map((year) => {
      const documents = matches.get(year) ?? [];
      const minutes = documents.filter((doc) => doc.kind === "minutes");
      const recordings = documents.filter((doc) => doc.kind === "recording");
      if (minutes.length > 0) {
        return {
          year,
          status: "available" as const,
          note: `${minutes.length} minutes document${minutes.length === 1 ? "" : "s"} identified.`,
          documents,
        };
      }
      if (recordings.length > 0) {
        return {
          year,
          status: "recordings_only" as const,
          note: "Recordings were found, but no minutes document for this year was identified.",
          documents,
        };
      }
      return {
        year,
        status: (year === 2025 ? "missing_expected" : "not_found_in_sync") as
          | "missing_expected"
          | "not_found_in_sync",
        note:
          year === 2025
            ? "No 2025 minutes document was identified in the mirrored files."
            : `No ${year} minutes document was identified.`,
        documents: [],
      };
    }),
    undated,
  };
}
