import { ImageResponse } from "next/og";

const AUEVO_MARK_DATA_URL = "data:image/png;base64,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";

// The static opengraph-image.png this replaced was still the OLD site's
// Solana-fee-scanner pitch ("Stop paying for their wins") — stale since
// well before this session's RWA-platform rebuild, so every shared link
// (including the first public X post) was showing a completely wrong
// card. Generated instead of a hand-made PNG so the copy can never drift
// from the site's own current headline again without this file also
// being touched.
export const alt = "Auevo — One platform for everything tokenized.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#f7f9fd",
          backgroundImage:
            "radial-gradient(ellipse 60% 55% at 88% 12%, rgba(36,88,232,0.17), transparent 65%), radial-gradient(ellipse 45% 40% at 8% 100%, rgba(73,193,220,0.1), transparent 60%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={AUEVO_MARK_DATA_URL} alt="" style={{ width: 48, height: 48 }} />
          <span style={{ color: "#121b2d", fontSize: 30, fontWeight: 800, letterSpacing: "0.055em" }}>
            AUEVO
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 1000 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 66,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              color: "#121b2d",
            }}
          >
            <span style={{ display: "flex" }}>One platform for</span>
            <span style={{ display: "flex" }}>
              <span style={{ color: "#2458e8", fontStyle: "italic" }}>everything</span>
              <span style={{ marginLeft: 18 }}>tokenized.</span>
            </span>
          </div>
          <div style={{ display: "flex", fontSize: 24, lineHeight: 1.5, color: "#64728a", maxWidth: 880 }}>
            Search every tokenized stock, ETF, treasury, commodity and credit claim. Compare
            issuers, trade in one signature, earn on pools and baskets.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(36,88,232,0.35)",
              color: "#2458e8",
              fontSize: 15,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Verified on-chain
          </span>
          <span style={{ color: "#63718a", fontSize: 20 }}>auevo.io</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
