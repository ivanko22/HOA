"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  documentId: string;
  title: string;
  initialPage: number;
  excerpt?: string | null;
  matchText?: string | null;
  amountLabel?: string | null;
  mimeType?: string | null;
  onClose?: () => void;
};

export function DocumentEvidencePreview({
  documentId,
  title,
  initialPage,
  excerpt,
  matchText,
  amountLabel,
  mimeType,
  onClose,
}: Props) {
  const [page, setPage] = useState(initialPage);
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(1.1);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/file`, {
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("File unavailable");
        const buffer = await response.arrayBuffer();
        if (!cancelled) setBytes(buffer);
      } catch {
        if (!cancelled) setError("Could not open the stored document.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    const mime = (mimeType ?? "").toLowerCase();
    (async () => {
      try {
        if (mime.startsWith("image/")) {
          const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
          if (!cancelled) {
            setSrc(url);
            setPageCount(1);
          }
          return;
        }
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
        }
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        const safePage = Math.min(Math.max(page, 1), doc.numPages);
        const pdfPage = await doc.getPage(safePage);
        const viewport = pdfPage.getViewport({ scale: zoom });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        await pdfPage.render({ canvasContext: context, viewport } as never).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        setSrc(canvas.toDataURL("image/png"));
        void fetch(`/api/documents/${documentId}/preview`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: safePage,
            kind: "page",
            dataUrl: canvas.toDataURL("image/png"),
          }),
        }).catch(() => undefined);
      } catch {
        if (!cancelled) setError("This format cannot be rendered here.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes, documentId, mimeType, page, zoom]);

  const highlight = useMemo(() => matchText || amountLabel || null, [amountLabel, matchText]);

  return (
    <div className="w-[min(92vw,28rem)] border border-[var(--border)] bg-white shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-[var(--muted)]">
            Page {page} of {pageCount}
            {amountLabel ? ` · ${amountLabel}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-[var(--muted)] hover:underline"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-xs">
        <button
          type="button"
          className="border border-[var(--border)] px-2 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          Prev
        </button>
        <button
          type="button"
          className="border border-[var(--border)] px-2 py-1 disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
        >
          Next
        </button>
        <button
          type="button"
          className="border border-[var(--border)] px-2 py-1"
          onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.15).toFixed(2))))}
        >
          Zoom −
        </button>
        <button
          type="button"
          className="border border-[var(--border)] px-2 py-1"
          onClick={() => setZoom((value) => Math.min(2.4, Number((value + 0.15).toFixed(2))))}
        >
          Zoom +
        </button>
        <Link
          href={`/api/documents/${documentId}/file`}
          target="_blank"
          className="ml-auto text-[var(--accent)] hover:underline"
        >
          Open full document
        </Link>
      </div>
      <div className="max-h-[24rem] overflow-auto bg-[var(--surface-hover)] p-2">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Page ${page} of ${title}`} className="mx-auto max-w-full" />
        ) : (
          <p className="p-6 text-center text-sm text-[var(--muted)]">
            {error ?? "Loading page…"}
          </p>
        )}
      </div>
      <div className="space-y-1 border-t border-[var(--border)] px-3 py-2 text-xs">
        {highlight ? (
          <p>
            <span className="font-medium">Highlight target:</span>{" "}
            <mark className="bg-amber-100 px-1">{highlight}</mark>
          </p>
        ) : (
          <p className="text-[var(--muted)]">
            Exact on-page coordinates are unavailable; showing the source page and excerpt.
          </p>
        )}
        {excerpt ? (
          <p className="text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">Excerpt:</span> {excerpt}
          </p>
        ) : null}
      </div>
    </div>
  );
}
