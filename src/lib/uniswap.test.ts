import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  UNISWAP_QUOTER_V2,
  UNISWAP_SWAP_ROUTER_02,
  UNISWAP_V3_FACTORY,
  WETH9,
} from "./uniswap";

/**
 * viem only throws on a bad EIP-55 checksum when an address is ABI-encoded
 * as a function *argument* — not when it's used as a call's `to` target.
 * That gap let a wrong-cased UNISWAP_SWAP_ROUTER_02 ship and pass every
 * existing check, because getPool/quoteExactInputSingle only ever use
 * their contract addresses as call targets: `allowance`/`approve`, which
 * pass the router as an argument, were the ones silently broken. This
 * guards the whole exported set so a re-pasted address with the wrong
 * casing fails a test instead of a live approve() call.
 */
describe("uniswap.ts contract addresses", () => {
  const addresses = {
    UNISWAP_V3_FACTORY,
    UNISWAP_QUOTER_V2,
    UNISWAP_SWAP_ROUTER_02,
    WETH9,
  };

  for (const [name, address] of Object.entries(addresses)) {
    it(`${name} is a valid EIP-55 checksummed address`, () => {
      expect(getAddress(address)).toBe(address);
    });
  }
});
