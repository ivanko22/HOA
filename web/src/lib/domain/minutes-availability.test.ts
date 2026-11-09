import { describe, expect, it } from "vitest";
import { minutesAvailability } from "./minutes-availability";

describe("minutesAvailability", () => {
  it("marks a year available only when a minutes document is identified", () => {
    const result = minutesAvailability([
      {
        id: "pdf",
        name: "Board Meeting Minutes October 2025.pdf",
        path: "/Willows/Minutes/Board Meeting Minutes October 2025.pdf",
        webViewLink: "https://drive.google.com/file/d/pdf/view",
        documentId: "doc-2025",
      },
      {
        id: "audio",
        name: "ECM 10.14.2025.m4a",
        path: "/Willows/Minutes/Recordings/ECM 10.14.2025.m4a",
        mimeType: "audio/mp4",
      },
      {
        id: "folder",
        name: "2024 Minutes",
        path: "/Willows/2024 Minutes",
        isFolder: true,
      },
      {
        id: "insurance",
        name: "2025 policy.pdf",
        path: "/Willows/2025/Insurance/2025 policy.pdf",
      },
    ]);
    const y2025 = result.years.find((year) => year.year === 2025);
    expect(y2025?.status).toBe("available");
    expect(y2025?.documents.map((doc) => doc.driveFileId)).toEqual(["pdf", "audio"]);
    expect(y2025?.documents.find((doc) => doc.driveFileId === "pdf")).toMatchObject({
      kind: "minutes",
      documentId: "doc-2025",
      webViewLink: "https://drive.google.com/file/d/pdf/view",
    });
    expect(result.years.find((year) => year.year === 2024)?.status).toBe(
      "not_found_in_sync",
    );
  });

  it("does not call a year available when only a recording matches", () => {
    const result = minutesAvailability([
      {
        id: "audio",
        name: "Board meeting 2025.m4a",
        path: "/Minutes/Board meeting 2025.m4a",
        mimeType: "audio/mp4",
      },
    ]);
    expect(result.years.find((year) => year.year === 2025)?.status).toBe(
      "recordings_only",
    );
  });
});
