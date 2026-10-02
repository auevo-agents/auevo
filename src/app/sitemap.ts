import type { MetadataRoute } from "next";

// Auevo is repositioning from a memecoin/fee-scanner site to an RWA
// (tokenized real-world assets) marketplace + scanner — see
// docs/RWA_SPEC.md. /legacy/fees and /trade are the old Solana-era pages,
// kept reachable by direct URL but deliberately left out of the sitemap
// (RWA_SPEC.md phase 0: "в sitemap не включаем"). /scanner is the EVM
// contract-security scanner, which stays relevant to the RWA risk-scoring
// work in later phases, so it keeps its sitemap entry.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://auevo.io",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://auevo.io/scanner",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      // The RWA marketplace that used to be the homepage — still fully
      // live, just no longer the headline (see src/app/page.tsx).
      url: "https://auevo.io/rwa",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];
}
