"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f6f4ef",
          color: "#1c1917",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 560, padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>
            This page couldn’t load
          </h1>
          <p style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
            {error.message || "Reload to try again."}
          </p>
          {error.digest ? (
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#57534e" }}>
              Error {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#9a3412",
              color: "white",
              border: 0,
              padding: "8px 16px",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
