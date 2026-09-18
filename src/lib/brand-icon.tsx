import { ImageResponse } from "next/og";

/** Renders the Take Me Quality app icon as a PNG of the given size. */
export function renderBrandIcon(size: number, opts: { maskable?: boolean } = {}) {
  const pad = opts.maskable ? size * 0.16 : size * 0.06;
  const inner = size - pad * 2;
  const small = size < 64;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: opts.maskable ? "#00a6eb" : "transparent" }}>
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: inner * 0.24,
            background: "#000000",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {small ? (
            <div style={{ color: "#fff", fontSize: inner * 0.56, fontWeight: 800, letterSpacing: -1, display: "flex" }}>tm</div>
          ) : (
            <>
              <div style={{ color: "#fff", fontSize: inner * 0.3, fontWeight: 800, lineHeight: 1, letterSpacing: -2, display: "flex" }}>take</div>
              <div style={{ color: "#fff", fontSize: inner * 0.3, fontWeight: 800, lineHeight: 1, letterSpacing: -2, display: "flex" }}>me</div>
            </>
          )}
          <div
            style={{
              position: "absolute",
              right: inner * 0.1,
              bottom: inner * 0.1,
              width: inner * 0.16,
              height: inner * 0.16,
              borderRadius: 999,
              background: "#00a6eb",
              display: "flex",
            }}
          />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
