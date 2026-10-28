import Link from "next/link";

export function SourceReference({
  page,
  reference,
  excerpt,
  documentHref,
}: {
  page?: string | null;
  reference?: string | null;
  excerpt?: string | null;
  documentHref?: string | null;
}) {
  const hasAny = page || reference || excerpt || documentHref;
  if (!hasAny) {
    return <span className="text-xs text-[var(--muted)]">No source reference</span>;
  }

  return (
    <div className="space-y-1 text-xs text-[var(--muted)]">
      {reference ? <p>{reference}</p> : null}
      {page ? <p>Page {page}</p> : null}
      {excerpt ? (
        <p className="italic text-[var(--foreground)]/80">“{excerpt}”</p>
      ) : null}
      {documentHref ? (
        <Link
          href={documentHref}
          className="font-medium text-[var(--accent)] hover:underline"
        >
          View source document
        </Link>
      ) : null}
    </div>
  );
}
