import { describe, expect, it } from "vitest";
import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";
import { UNIVERSAL_ROUTER_ADDRESS, UniversalRouterVersion } from "@uniswap/universal-router-sdk";
import { getAddress } from "viem";
import { PERMIT2, UNIVERSAL_ROUTER, POOL_MANAGER, V4_QUOTER, STATE_VIEW, V4_POSITION_MANAGER, USDG } from "./addresses";

/**
 * addresses.ts hardcodes PERMIT2/UNIVERSAL_ROUTER as literals instead of
 * calling the SDKs at runtime (see the comment there — those SDKs pull in
 * `ethers`, which must never reach the browser, and this file is imported
 * from client components). This test is the tripwire that keeps those
 * literals honest: it re-derives the same two values from the SDKs
 * (server-side, test-only — never at runtime) and fails loudly if a future
 * `npm update` moves either one, the same way the app's real UniversalRouter
 * address has already moved twice on this chain.
 */
describe("hardcoded addresses stay in sync with their SDK source of truth", () => {
  it("PERMIT2 matches @uniswap/permit2-sdk's PERMIT2_ADDRESS", () => {
    expect(PERMIT2.toLowerCase()).toBe(PERMIT2_ADDRESS.toLowerCase());
  });

  it("UNIVERSAL_ROUTER matches @uniswap/universal-router-sdk's resolved v2.1.2 address for chain 4663", () => {
    const resolved = UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, 4663);
    expect(UNIVERSAL_ROUTER.toLowerCase()).toBe(resolved.toLowerCase());
  });
});

describe("every address is a valid, correctly checksummed EIP-55 address", () => {
  it.each([
    ["PERMIT2", PERMIT2],
    ["UNIVERSAL_ROUTER", UNIVERSAL_ROUTER],
    ["POOL_MANAGER", POOL_MANAGER],
    ["V4_QUOTER", V4_QUOTER],
    ["STATE_VIEW", STATE_VIEW],
    ["V4_POSITION_MANAGER", V4_POSITION_MANAGER],
    ["USDG", USDG],
  ])("%s round-trips through getAddress() unchanged", (_name, address) => {
    expect(getAddress(address)).toBe(address);
  });
});
