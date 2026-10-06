/**
 * Country-level gate for tokenized real-world assets (stocks, ETFs,
 * treasuries, private credit) — RWA_SPEC.md section 4: "unavailable to
 * US residents and sanctioned countries". Vercel sets `x-vercel-ip-country`
 * on every request at the edge (ISO 3166-1 alpha-2, or absent for
 * localhost/non-Vercel environments) — see
 * https://vercel.com/docs/edge-network/headers#x-vercel-ip-country.
 *
 * This list is a starting point, not legal advice: it covers the US (per
 * spec) plus the countries under comprehensive OFAC embargo (Cuba, Iran,
 * North Korea, Syria). It cannot express sub-country sanctioned regions
 * (e.g. Crimea) or entity/individual sanctions lists — IP geolocation
 * generally can't either. Confirm the real jurisdiction list with counsel
 * before this gate is asked to block anything more than page banners.
 */
export const RESTRICTED_COUNTRY_CODES = new Set([
  "US", // United States — explicit in RWA_SPEC.md section 4
  "CU", // Cuba
  "IR", // Iran
  "KP", // North Korea
  "SY", // Syria
]);

export function isRestrictedCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return RESTRICTED_COUNTRY_CODES.has(countryCode.toUpperCase());
}
