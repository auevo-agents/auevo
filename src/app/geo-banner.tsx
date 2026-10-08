import { headers } from "next/headers";
import { isRestrictedCountry } from "@/lib/rwa/geo";

/**
 * RWA_SPEC.md section 4: tokenized stocks are off-limits to US residents
 * and a handful of embargoed countries — this is the visible half of that
 * (a banner), not the enforcement half. Actual trade blocking belongs at
 * the swap-action level once there is a swap to block (Phase 2+); a
 * client can always spoof or omit `x-vercel-ip-country`, so this banner
 * is a disclosure, not a security boundary — same posture the repo
 * already takes with the /app section's `noindex` metadata.
 */
export async function GeoBanner() {
  const headersList = await headers();
  const country = headersList.get("x-vercel-ip-country");

  if (!isRestrictedCountry(country)) return null;

  return (
    <div className="geo-banner" role="alert">
      Tokenized stocks, ETFs and other real-world-asset tokens shown here
      are not offered to residents of the United States or of countries
      under comprehensive sanctions. You can keep browsing, but trading
      these instruments from your current location will be blocked.
    </div>
  );
}
