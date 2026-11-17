"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DocumentEvidencePreview } from "./document-evidence-preview";

type Props = {
  documentId: string;
  title: string;
  page?: string | number | null;
  excerpt?: string | null;
  matchText?: string | null;
  amountLabel?: string | null;
  mimeType?: string | null;
  className?: string;
};

const memoryCache = new Map<string, string>();

async function renderPdfPageThumb(
  bytes: ArrayBuffer,
  pageNumber: number,
): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(Math.min(Math.max(pageNumber, 1), doc.numPages));
  const viewport = page.getViewport({ scale: 0.35 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  await page.render({ canvasContext: context, viewport } as never).promise;
  return canvas.toDataURL("image/png");
}

export function DocumentThumbnail({
  documentId,
  title,
  page,
  excerpt,
  matchText,
  amountLabel,
  mimeType,
  className,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const reactId = useId();
  const pageNumber = Number(page) > 0 ? Number(page) : 1;
  const cacheKey = `${documentId}:p${pageNumber}`;

  useEffect(() => {
    let cancelled = false;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      setSrc(cached);
      return;
    }
    const mime = (mimeType ?? "").toLowerCase();
    const isPdf = mime.includes("pdf") || !mime;
    const isImage = mime.startsWith("image/");
    (async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/file`, {
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("File unavailable");
        const bytes = await response.arrayBuffer();
        if (cancelled) return;
        if (isImage) {
          const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
          memoryCache.set(cacheKey, blobUrl);
          setSrc(blobUrl);
          return;
        }
        if (!isPdf) {
          setError("Preview unavailable");
          return;
        }
        const dataUrl = await renderPdfPageThumb(bytes, pageNumber);
        if (cancelled) return;
        memoryCache.set(cacheKey, dataUrl);
        setSrc(dataUrl);
        void fetch(`/api/documents/${documentId}/preview`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: pageNumber, kind: "thumb", dataUrl }),
        }).catch(() => undefined);
      } catch {
        if (!cancelled) setError("Preview unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, documentId, mimeType, pageNumber]);

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 220);
  }

  function keepOpen() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  }

  return (
    <div
      className={`relative ${className ?? ""}`}
      onMouseEnter={keepOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-label={`Preview ${title}, page ${pageNumber}`}
        aria-describedby={`${reactId}-preview`}
        className="block h-16 w-12 overflow-hidden border border-[var(--border)] bg-[var(--surface-hover)]"
        onClick={() => setOpen((value) => !value)}
        onFocus={keepOpen}
        onBlur={scheduleClose}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-full w-full object-contain object-top"
          />
        ) : (
          <span className="flex h-full items-center justify-center p-1 text-[10px] leading-tight text-[var(--muted)]">
            {error ?? "…"}
          </span>
        )}
      </button>
      {open ? (
        <div
          id={`${reactId}-preview`}
          className="absolute left-0 top-0 z-40 translate-x-14 sm:translate-x-16"
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClose}
        >
          <DocumentEvidencePreview
            documentId={documentId}
            title={title}
            initialPage={pageNumber}
            excerpt={excerpt}
            matchText={matchText}
            amountLabel={amountLabel}
            mimeType={mimeType}
            onClose={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
