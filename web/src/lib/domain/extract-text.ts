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

function appendPiece(pieces: string[], text: string, separate: boolean) {
  if (!text) return;
  const previous = pieces[pieces.length - 1] ?? "";
  if (
    separate &&
    previous &&
    !previous.endsWith(" ") &&
    !previous.endsWith("\n")
  ) {
    pieces.push(" ");
  }
  pieces.push(text);
}

function cmapFromStream(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const put = (code: number, glyph: string) => {
    if (glyph) map.set(code, glyph);
  };
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      put(parseInt(pair[1], 16), String.fromCharCode(parseInt(pair[2], 16)));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const start = parseInt(range[1], 16);
      const end = parseInt(range[2], 16);
      const dest = parseInt(range[3], 16);
      for (let code = start; code <= end && code - start < 256; code += 1) {
        put(code, String.fromCharCode(dest + (code - start)));
      }
    }
    for (const range of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g,
    )) {
      const start = parseInt(range[1], 16);
      const glyphs = [...range[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
      glyphs.forEach((glyph, index) => {
        put(start + index, String.fromCharCode(parseInt(glyph[1], 16)));
      });
    }
  }
  return map;
}

function fontMaps(pdf: Buffer): Map<string, Map<number, string>> {
  const source = pdf.toString("latin1");
  const objects = new Map<number, string>();
  for (const match of source.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)) {
    objects.set(Number(match[1]), match[2]);
  }
  const byObject = new Map<number, Map<number, string>>();
  for (const [id, body] of objects) {
    const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(body);
    if (!ref) continue;
    const stream = streamBody(objects.get(Number(ref[1])) ?? "");
    if (!stream) continue;
    const map = cmapFromStream(stream.toString("latin1"));
    if (map.size > 0) byObject.set(id, map);
  }
  const byName = new Map<string, Map<number, string>>();
  for (const body of objects.values()) {
    for (const link of body.matchAll(/\/(F[A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      const map = byObject.get(Number(link[2]));
      if (map) byName.set(link[1], map);
    }
  }
  return byName;
}

function streamBody(obj: string): Buffer | null {
  const marker = /stream\r?\n/.exec(obj);
  if (!marker || marker.index == null) return null;
  const start = marker.index + marker[0].length;
  const end = obj.indexOf("endstream", start);
  if (end < 0) return null;
  let raw = Buffer.from(obj.slice(start, end), "latin1");
  while (raw.length > 0 && (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)) {
    raw = raw.subarray(0, raw.length - 1);
  }
  if (/FlateDecode/.test(obj)) {
    try {
      return inflateSync(raw);
    } catch {
      try {
        return inflateRawSync(raw);
      } catch {
        return null;
      }
    }
  }
  return raw;
}

function textFromPdfContent(
  body: Buffer,
  fonts: Map<string, Map<number, string>>,
): string {
  const raw = body.toString("latin1");
  const blocks = raw.match(/BT[\s\S]*?ET/g) ?? [];
  const pieces: string[] = [];
  const token =
    /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]+)>\s*Tj|\((?:\\.|[^\\)])*\)/g;
  for (const block of blocks) {
    let font: Map<number, string> | undefined;
    for (const item of block.matchAll(token)) {
      if (item[1]) {
        font = fonts.get(item[1]);
        continue;
      }
      if (item[2]) {
        if (!font || font.size === 0) continue;
        const hex = item[2].replace(/\s+/g, "");
        let chars = "";
        for (let i = 0; i + 4 <= hex.length; i += 4) {
          chars += font.get(parseInt(hex.slice(i, i + 4), 16)) ?? "";
        }
        appendPiece(pieces, chars, false);
        continue;
      }
      const literal = unescapePdfString(item[0].slice(1, -1)).trim();
      if (literal) appendPiece(pieces, literal.slice(0, 500), true);
    }
    pieces.push("\n");
  }
  return pieces.join("").replace(/[^\S\n]+/g, " ").trim();
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
  const fonts = fontMaps(bytes);
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
    const text = textFromPdfContent(body, fonts);
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
