import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractCandidatesFromText } from "./drive-classify";
import { textForExtraction } from "./extract-text";
import { locateEvidenceInDocumentText } from "./visual-verification";

/**
 * Independent visual evidence check against real Willows PDFs when present.
 * Set WILLOWS_DOCS_DIR (default /tmp/willows-docs) to a folder of imported PDFs.
 * Skips cleanly when the directory is unavailable — does not invent results.
 */
const DOCS_DIR = process.env.WILLOWS_DOCS_DIR ?? "/tmp/willows-docs";

function pathHint(name: string): string {
  if (/^Willows Financials/i.test(name)) {
    return `/Willows Condos Records/Financials/${name}`;
  }
  return `/Willows Condos Records/Monthly Bills and Receipts/By Month/September 2026/${name}`;
}

describe("Willows visual verification (optional local PDFs)", () => {
  it("independently verifies extracted amounts against document text", () => {
    if (!existsSync(DOCS_DIR)) {
      console.warn(
        `Skipping Willows PDF visual check: ${DOCS_DIR} is not available in this environment.`,
      );
      return;
    }
    const files = readdirSync(DOCS_DIR).filter((name) =>
      /\.pdf$/i.test(name) || !path.extname(name),
    );
    expect(files.length).toBeGreaterThan(0);

    let facts = 0;
    let match = 0;
    let mismatch = 0;
    let ambiguous = 0;
    let unable = 0;
    const problems: string[] = [];

    for (const name of files.sort()) {
      const bytes = readFileSync(path.join(DOCS_DIR, name));
      const text = textForExtraction(bytes, "application/pdf", name);
      const extracted = extractCandidatesFromText(text, {
        filename: name,
        path: pathHint(name),
      }).filter((fact) => fact.numericValue);
      for (const fact of extracted) {
        facts += 1;
        const hit = locateEvidenceInDocumentText(text, {
          factType: fact.factType ?? "other",
          label: fact.label,
          numericValue: fact.numericValue ?? null,
          preferredPage: fact.sourcePage,
          periodStart: fact.periodStart,
          periodEnd: fact.periodEnd,
          sourceExcerpt: fact.sourceExcerpt,
        });
        if (hit.status === "visual_match") match += 1;
        else if (hit.status === "mismatch") {
          mismatch += 1;
          problems.push(`${name} ${fact.factType} ${fact.numericValue}: ${hit.reason}`);
        } else if (hit.status === "ambiguous") ambiguous += 1;
        else unable += 1;
      }
    }

    console.info(
      JSON.stringify({
        documents: files.length,
        facts,
        match,
        mismatch,
        ambiguous,
        unable,
        problems,
      }),
    );

    expect(facts).toBeGreaterThan(0);
    expect(mismatch).toBe(0);
  });
});
