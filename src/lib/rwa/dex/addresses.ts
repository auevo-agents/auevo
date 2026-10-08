import type { Address } from "viem";
import {
  UNISWAP_V3_FACTORY,
  UNISWAP_QUOTER_V2,
  UNISWAP_SWAP_ROUTER_02,
  WETH9,
  FEE_TIERS,
} from "@/lib/uniswap";

/**
 * Uniswap v4 core contracts on Robinhood Chain (chain id 4663), plus USDG —
 * the quote asset every RWA (tokenized stock) pool trades against (see
 * docs/RWA_SPEC.md section 2). Sourced and cross-checked 2026-09-26 against
 * THREE independent channels that all agree:
 *
 * 1. Uniswap's own `deployments/4663.md` / `deployments/json/4663.json` in
 *    github.com/Uniswap/contracts (the same canonical file uniswap.ts's v3
 *    addresses came from), cross-checked against docs.uniswap.org's v4
 *    deployments page and github.com/Uniswap/universal-router's own
 *    `deploy-addresses/robinhood.json`.
 * 2. The `@uniswap/universal-router-sdk` npm package's own bundled
 *    CHAIN_CONFIGS for chain 4663 — a separate distribution channel from
 *    (1), fetched from the npm registry rather than GitHub, and it agrees
 *    exactly (its `weth` entry for this chain also matches WETH9 below,
 *    which is one more independent confirmation of that address).
 * 3. UniversalRouter specifically was also confirmed by hand on
 *    robinhoodchain.blockscout.com — a verified contract literally named
 *    "UniversalRouter" at this address, screenshotted 2026-09-26.
 *
 * UniversalRouter is called out separately because this one address has
 * moved TWICE on this chain within about four months (v2.1.1 -> an
 * intermediate redeploy -> the current v2.1.2). docs.uniswap.org's live
 * page was still showing the stale v2.1.1 address as of this writing (an
 * update PR exists but is closed, not merged) — a reminder that even an
 * "official docs" page can lag the canonical repo, so the repo + SDK +
 * Blockscout cross-check mattered here, not just one source.
 *
 * PERMIT2 below is Permit2's canonical cross-chain singleton (the same
 * bytes on every chain it's deployed to, by design) — the exact value
 * `@uniswap/permit2-sdk`'s own `PERMIT2_ADDRESS` export resolves to,
 * cross-checked with a throwaway script rather than imported here: this
 * file is imported from client components (e.g. swap-panel.tsx, for the
 * two addresses it needs for allowance reads) via viem/wagmi only, and
 * `@uniswap/permit2-sdk` pulls in `ethers` as a hard dependency — bundling
 * that into the browser for two constants would undo the point of
 * keeping the heavier Uniswap SDKs (v4-sdk, router-sdk, universal-router-
 * sdk, permit2-sdk) server-only (see build.ts's own note on that choice).
 * Same reasoning for UNIVERSAL_ROUTER: `@uniswap/universal-router-sdk`'s
 * `UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, 4663)`
 * resolves to this exact literal (verified the same way), used instead of
 * calling that function directly.
 */
export const POOL_MANAGER: Address = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
export const V4_QUOTER: Address = "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94";
export const STATE_VIEW: Address = "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b";
export const V4_POSITION_MANAGER: Address = "0x58daec3116aae6D93017bAAea7749052E8a04fA7";

export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/** Current UniversalRouter on Robinhood Chain — see the version-history note above. */
export const UNIVERSAL_ROUTER: Address = "0x204FAca1764B154221e35c0d20aBb3c525710498";

/**
 * USDG (Global Dollar, Paxos) on Robinhood Chain — the quote asset for
 * every tokenized-stock pool per RWA_SPEC.md. Corroborated across many
 * independent first-party sources (Uniswap's own frontend config,
 * MetaMask, Trust Wallet, Trezor's asset lists all agree on this exact
 * address) but not read directly from Paxos's or Robinhood's own docs in
 * this session (network policy blocked both). Decimals is 6, NOT 18 —
 * flagged explicitly because every other token this codebase deals with
 * (WETH9, most ERC-20s) is 18, making this an easy place to introduce a
 * silent decimal-scaling bug.
 */
export const USDG: Address = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const USDG_DECIMALS = 6;

/** Re-exported so DEX code has one place to import both quote assets from. */
export { UNISWAP_V3_FACTORY, UNISWAP_QUOTER_V2, UNISWAP_SWAP_ROUTER_02, WETH9, FEE_TIERS };

/**
 * Standard fee tier -> tick spacing convention (Uniswap's own default,
 * unchanged from v3 to v4). v4 pools can in principle use any tickSpacing
 * or a hook contract, so this is a heuristic for probing "vanilla" pools
 * — the ones HyperDex's own research (RWA_SPEC.md section 2) found is
 * what RWA/USDG pools on this chain actually look like today. Phase 1's
 * registry will read pool creation events directly instead of guessing
 * fee/tickSpacing combinations once it exists.
 */
export const FEE_TO_TICK_SPACING: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

export const V4_FEE_TIERS = [500, 3000, 10000, 100] as const;

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
