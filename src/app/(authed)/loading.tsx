export default function Loading() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "40vh",
        color: "var(--accent)",
      }}
    >
      <span className="spin" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  );
}
