"use client";

export default function SourcePageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
      role="alert"
    >
      <p className="font-semibold">This source page couldn’t load</p>
      <p className="mt-1 break-words">
        {error.message.includes("unexpected response")
          ? "The server was cut off before it could send the page. Files already saved are on Documents. Reload, then use Sync now to continue."
          : error.message}
      </p>
      {error.digest ? (
        <p className="mt-1 text-xs">Error {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-3 bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
