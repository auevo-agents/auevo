import { type Address, encodeAbiParameters, keccak256 } from "viem";
import { ZERO_ADDRESS } from "./addresses";

/**
 * A v4 pool's identity — there is no factory to ask "does a pool exist for
 * this pair" the way v3 has `factory.getPool`; v4 is a single PoolManager
 * singleton keyed by this struct's hash (poolId). Field order and casing
 * match v4-core's own `PoolKey` struct exactly (src/types/PoolKey.sol):
 * currency0 < currency1 by address (numerically, not lexicographically —
 * see sortCurrencies), fee, tickSpacing, hooks.
 */
export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

/** v4-core requires currency0 < currency1 as raw 160-bit integers (address(0) — native ETH — always sorts first). */
export function sortCurrencies(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

export function buildPoolKey(
  tokenA: Address,
  tokenB: Address,
  fee: number,
  tickSpacing: number,
  hooks: Address = ZERO_ADDRESS
): PoolKey {
  const [currency0, currency1] = sortCurrencies(tokenA, tokenB);
  return { currency0, currency1, fee, tickSpacing, hooks };
}

/**
 * PoolId = keccak256(abi.encode(poolKey)) — v4-core's own
 * `PoolIdLibrary.toId` (src/types/PoolId.sol), confirmed against Uniswap's
 * source rather than assumed. Cross-checked in pool-key.test.ts against
 * `@uniswap/v4-sdk`'s own `Pool.getPoolId`, which computes the same value
 * a different way (through its Currency/Token wrapper) — two independent
 * implementations of the same spec agreeing is the actual verification,
 * not just re-reading the same source twice.
 */
export function poolId(key: PoolKey): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint24" },
      { type: "int24" },
      { type: "address" },
    ],
    [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]
  );
  return keccak256(encoded);
}
