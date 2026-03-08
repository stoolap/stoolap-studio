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
      <head>
        <style>{`
          @media (prefers-color-scheme: light) {
            body { background-color: #fafafa !important; color: #0a0a0a !important; }
            body button { background-color: #e5e5e5 !important; color: #0a0a0a !important; }
            body p { color: #737373 !important; }
          }
        `}</style>
      </head>
      <body
        style={{
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#a3a3a3",
              marginBottom: "1rem",
            }}
          >
            {error.message}
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              backgroundColor: "#262626",
              color: "#fafafa",
              border: "none",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
