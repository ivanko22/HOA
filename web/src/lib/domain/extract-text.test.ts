import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractCandidatesFromText } from "./drive-classify";
import { extractPdfText, textForExtraction } from "./extract-text";

function pdfStream(content: Buffer, filter: "flate" | "plain"): Buffer {
  const body = filter === "flate" ? deflateSync(content) : content;
  const dict =
    filter === "flate"
      ? "<< /Filter /FlateDecode /Length 1 >>\n"
      : "<< /Length 1 >>\n";
  return Buffer.concat([
    Buffer.from(dict),
    Buffer.from("stream\n"),
    body,
    Buffer.from("\nendstream"),
  ]);
}

describe("text extraction", () => {
  it("reads text operators from an uncompressed PDF stream", () => {
    const bytes = pdfStream(
      Buffer.from("BT (Cash balance $1,234.56) Tj ET"),
      "plain",
    );
    expect(extractPdfText(bytes)).toMatch(/Cash balance \$1,234\.56/);
  });

  it("reads text operators from a FlateDecode stream", () => {
    const bytes = pdfStream(
      Buffer.from("BT (Total assets $8,000.00) Tj ET"),
      "flate",
    );
    const text = textForExtraction(bytes, "application/pdf", "balance-sheet.pdf");
    expect(text).toMatch(/Total assets \$8,000\.00/);
    const facts = extractCandidatesFromText(text, {
      filename: "September 2026 balance-sheet.pdf",
      path: "/Financials",
    });
    expect(facts.find((fact) => fact.factType === "total_assets")?.numericValue).toBe(
      "8000.00",
    );
  });

  it("reads an invoice amount and ignores drawing coordinates", () => {
    const bytes = pdfStream(
      Buffer.from(
        "BT 1 0 0 1 474.24 700 Tm (Amount Due:) Tj ( $2,110.00) Tj (Amount Paid) Tj ($0.00) Tj ET",
      ),
      "plain",
    );
    const text = textForExtraction(bytes, "application/pdf", "Roof repair 6663.pdf");
    expect(text).toMatch(/Amount Due/);
    expect(text).toMatch(/\$2,110\.00/);
    expect(text).not.toMatch(/474\.24/);
    const facts = extractCandidatesFromText(text, {
      filename: "Roof repair 6663.pdf",
      path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/August 2026/Roof repair 6663.pdf",
    });
    expect(facts.find((fact) => fact.factType === "invoice_amount")?.numericValue).toBe(
      "2110.00",
    );
  });

  it("decodes an amount due that is stored as font glyphs", () => {
    const phrase = "Amount Due $2,110.00";
    const pairs = [...phrase]
      .map((char, index) => {
        const code = (index + 1).toString(16).padStart(4, "0");
        const dest = char.charCodeAt(0).toString(16).padStart(4, "0");
        return { code, dest };
      });
    const cmap = `beginbfchar\n${pairs
      .map((pair) => `<${pair.code}> <${pair.dest}>`)
      .join("\n")}\nendbfchar\n`;
    const hex = pairs.map((pair) => pair.code).join("");
    const content = `BT /F1 12 Tf <${hex}> Tj ET\n1 0 0 1 474.24 321.68 Tm\n`;
    const pdf = Buffer.from(
      `%PDF-1.4
1 0 obj
<< /Type /Font /ToUnicode 2 0 R >>
endobj
2 0 obj
<< /Length ${cmap.length} >>
stream
${cmap}
endstream
endobj
3 0 obj
<< /Length ${content.length} >>
stream
${content}
endstream
endobj
4 0 obj
<< /Resources << /Font << /F1 1 0 R >> >> >>
endobj
`,
      "latin1",
    );
    const text = extractPdfText(pdf);
    expect(text).toMatch(/Amount Due \$2,110\.00/);
    expect(text).not.toMatch(/474\.24/);
    const facts = extractCandidatesFromText(text, {
      filename: "Roof repair 6663.pdf",
      path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/August 2026/Roof repair 6663.pdf",
    });
    expect(facts.find((fact) => fact.factType === "invoice_amount")?.numericValue).toBe(
      "2110.00",
    );
  });

  it("does not parse audio bytes as a PDF", () => {
    const bytes = Buffer.concat([
      Buffer.from("%PDF-1.1\n"),
      pdfStream(Buffer.from("BT (Cash balance $50,184.00) Tj ET"), "plain"),
    ]);
    expect(textForExtraction(bytes, "audio/mp4", "ECM #5 10.23.2026.m4a")).toBe("");
    expect(
      textForExtraction(bytes, "application/octet-stream", "meeting.m4a"),
    ).toBe("");
  });
});
