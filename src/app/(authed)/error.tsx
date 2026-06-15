"use client";

import { Btn, Icon } from "@/lib/ui";

/* Route-level error boundary: a thrown server/client error shows a friendly
   retry card instead of killing the whole page. */
export default function AuthedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "40vh" }}>
      <div className="card" style={{ width: 420, maxWidth: "100%", padding: 26, textAlign: "center" }}>
        <span
          className="tile-ic"
          style={{
            margin: "0 auto 14px",
            background: "color-mix(in srgb, var(--neg) 14%, transparent)",
            color: "var(--neg)",
          }}
        >
          <Icon name="bell" size={20} />
        </span>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>
          Something went wrong
        </div>
        <p className="lead" style={{ margin: "8px 0 18px" }}>
          {error.message?.slice(0, 200) || "An unexpected error occurred."}
        </p>
        <Btn onClick={() => reset()}>Try again</Btn>
      </div>
    </div>
  );
}
