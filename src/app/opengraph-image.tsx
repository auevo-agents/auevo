import { ImageResponse } from "next/og";

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
          background: "#070909",
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 88% 8%, rgba(190,158,94,0.16), transparent 60%), radial-gradient(ellipse 50% 40% at 8% 100%, rgba(120,100,60,0.1), transparent 60%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="40" height="40" viewBox="0 0 48 48">
            <path
              fill="#c9b27c"
              fillRule="evenodd"
              d="M22.35 4.5h3.5L42 42h-8.15l-3.26-8.15H17.5L14.25 42H6L22.35 4.5Zm1.82 12.18-4.1 10.37h8.08l-3.98-10.37Z"
            />
            <path
              fill="none"
              stroke="#c9b27c"
              strokeWidth="1.6"
              strokeLinecap="round"
              d="M4.6 31.2c5.35 5.1 17.45 6.25 28.2 1.05 7.2-3.5 11.58-8.88 9.77-12.03-1.38-2.41-6.4-2.24-12.07-.1"
            />
            <circle cx="41.1" cy="20.45" r="3.05" fill="#eee3c8" stroke="#9d7c3f" strokeWidth="0.75" />
          </svg>
          <span style={{ color: "#f4f0e8", fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>
            auevo
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
              color: "#f7f6f2",
            }}
          >
            <span style={{ display: "flex" }}>One platform for</span>
            <span style={{ display: "flex" }}>
              <span style={{ color: "#d3c5a8", fontStyle: "italic" }}>everything</span>
              <span style={{ marginLeft: 18 }}>tokenized.</span>
            </span>
          </div>
          <div style={{ display: "flex", fontSize: 24, lineHeight: 1.5, color: "#a7a49b", maxWidth: 880 }}>
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
              border: "1px solid rgba(201,178,124,0.35)",
              color: "#c9b27c",
              fontSize: 15,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Verified on-chain
          </span>
          <span style={{ color: "#6b6a63", fontSize: 20 }}>auevo.io</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
