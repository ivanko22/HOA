import { inflateRawSync, inflateSync } from "node:zlib";
import { isAudioFile, isImageFile, isVideoFile } from "./sync-file";

const STREAM = Buffer.from("stream");
const END_STREAM = Buffer.from("endstream");

function unescapePdfString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodePdfHex(hex: string): string {
  const cleaned = hex.replace(/\s+/g, "");
  if (cleaned.length < 2) return "";
  const padded = cleaned.length % 2 === 0 ? cleaned : `${cleaned}0`;
  const bytes = Buffer.from(padded, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  return bytes.toString("latin1");
}

function textFromPdfContent(body: Buffer): string {
  const raw = body.toString("latin1");
  const blocks = raw.match(/BT[\s\S]*?ET/g) ?? [];
  const pieces: string[] = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  for (const block of blocks) {
    for (const item of block.matchAll(literal)) {
      const text = unescapePdfString(item[0].slice(1, -1)).trim();
      if (text) pieces.push(text.slice(0, 500));
    }
    for (const hex of block.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
      const text = decodePdfHex(hex[1]).replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "").trim();
      if (text) pieces.push(text.slice(0, 500));
    }
    pieces.push("\n");
  }
  return pieces.join(" ").replace(/[^\S\n]+/g, " ").trim();
}

function inflateStream(raw: Buffer): Buffer | null {
  if (raw.length === 0 || raw.length > 8_000_000) return null;
  try {
    const inflated = inflateSync(raw);
    return inflated.length > 1_500_000 ? inflated.subarray(0, 1_500_000) : inflated;
  } catch {
    try {
      const inflated = inflateRawSync(raw);
      return inflated.length > 1_500_000 ? inflated.subarray(0, 1_500_000) : inflated;
    } catch {
      return null;
    }
  }
}

/** Pull text drawing operators out of a PDF buffer. Returns "" when none are found. */
export function extractPdfText(bytes: Buffer): string {
  const pages: string[] = [];
  let cursor = 0;
  let page = 0;
  while (cursor < bytes.length && page < 40) {
    const start = bytes.indexOf(STREAM, cursor);
    if (start < 0) break;
    if (
      start >= 3 &&
      bytes.subarray(start - 3, start).toString("latin1") === "end"
    ) {
      cursor = start + STREAM.length;
      continue;
    }
    let dataStart = start + STREAM.length;
    if (bytes[dataStart] === 0x0d && bytes[dataStart + 1] === 0x0a) dataStart += 2;
    else if (bytes[dataStart] === 0x0a || bytes[dataStart] === 0x0d) dataStart += 1;
    const endAt = bytes.indexOf(END_STREAM, dataStart);
    if (endAt < 0) break;
    let dataEnd = endAt;
    if (dataEnd > dataStart && (bytes[dataEnd - 1] === 0x0a || bytes[dataEnd - 1] === 0x0d)) {
      dataEnd -= 1;
    }
    if (dataEnd > dataStart && bytes[dataEnd - 1] === 0x0d) dataEnd -= 1;
    const dict = bytes.subarray(Math.max(0, start - 400), start).toString("latin1");
    let body = bytes.subarray(dataStart, dataEnd);
    if (/FlateDecode/.test(dict)) {
      const inflated = inflateStream(body);
      body = inflated ?? Buffer.alloc(0);
    }
    const text = textFromPdfContent(body);
    if (text) {
      page += 1;
      pages.push(`Page ${page}\n${text}`);
    }
    cursor = endAt + END_STREAM.length;
  }
  return pages.join("\n").slice(0, 200_000);
}

/**
 * Text we are willing to mine for financial figures.
 * Audio, video, and images return an empty string so they are never scanned
 * as if they were PDFs.
 */
export function textForExtraction(
  bytes: Buffer,
  mimeType: string,
  filename = "",
): string {
  if (
    isAudioFile(filename, mimeType) ||
    isVideoFile(filename, mimeType) ||
    isImageFile(filename, mimeType)
  ) {
    return "";
  }
  const mime = mimeType.toLowerCase();
  const isPdf =
    mime.includes("pdf") ||
    filename.toLowerCase().endsWith(".pdf") ||
    bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  if (isPdf) {
    // Do not scan raw PDF bytes. Drawing coordinates look like dollar amounts.
    return extractPdfText(bytes);
  }
  const sample = bytes.subarray(0, 512_000);
  if (
    mime.startsWith("text/") ||
    mime.includes("csv") ||
    mime === "application/json" ||
    /\.(txt|csv|json|md)$/i.test(filename)
  ) {
    return sample.toString("utf8").slice(0, 500_000);
  }
  return sample
    .toString("latin1")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .slice(0, 200_000);
}
