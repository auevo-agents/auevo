import {
  getAddress,
  hexToBigInt,
  keccak256,
  pad,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import type { EvmReadClient } from "./client";

/**
 * Proxy detection.
 *
 * This runs before any capability analysis for one reason: on a proxy the
 * address you paste holds almost no logic. Mint, pause and blacklist all
 * live in the implementation contract, so analysing the proxy's own
 * bytecode would report a clean token no matter what sits behind it.
 *
 * Storage slots are derived from their specification labels at module
 * load instead of being pasted in as constants — the derivation is the
 * documentation, and it cannot drift from the spec.
 */

/** bytes32(uint256(keccak256(label)) - 1), per EIP-1967. */
function eip1967Slot(label: string): Hex {
  return toHex(hexToBigInt(keccak256(toBytes(label))) - 1n, { size: 32 });
}

export const IMPLEMENTATION_SLOT = eip1967Slot("eip1967.proxy.implementation");
export const ADMIN_SLOT = eip1967Slot("eip1967.proxy.admin");
export const BEACON_SLOT = eip1967Slot("eip1967.proxy.beacon");

/** OpenZeppelin's pre-EIP-1967 slot, plain keccak with no offset. */
export const ZEPPELINOS_IMPLEMENTATION_SLOT = keccak256(
  toBytes("org.zeppelinos.proxy.implementation")
);

/**
 * EIP-1167 minimal proxy: the implementation address is baked into the
 * runtime code, so it can never be changed — worth distinguishing from an
 * upgradeable proxy rather than lumping both together as "proxy".
 */
const MINIMAL_PROXY_RE = /73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/;

/**
 * The implementation baked into an EIP-1167 minimal proxy, or null when
 * the code is not one. Exported separately from detectProxy because it is
 * pure — it needs no RPC and can be tested on its own.
 */
export function minimalProxyImplementation(code: Hex): Address | null {
  const match = MINIMAL_PROXY_RE.exec(code.toLowerCase());
  return match ? getAddress(`0x${match[1]}`) : null;
}

export type ProxyKind =
  | "eip1167-minimal"
  | "eip1967"
  | "eip1967-beacon"
  | "zeppelinos";

export interface ProxyInfo {
  kind: ProxyKind;
  implementation: Address | null;
  /** Admin able to perform the upgrade, where the pattern exposes one. */
  admin: Address | null;
  /** Whether the logic behind this address can be replaced after deployment. */
  upgradeable: boolean;
}

function addressFromWord(word: Hex | undefined | null): Address | null {
  if (!word || word === "0x") return null;
  const padded = pad(word, { size: 32 });
  if (hexToBigInt(padded) === 0n) return null;
  return getAddress(`0x${padded.slice(-40)}`);
}

async function readAddressSlot(
  client: EvmReadClient,
  address: Address,
  slot: Hex
): Promise<Address | null> {
  try {
    return addressFromWord(await client.getStorageAt({ address, slot }));
  } catch {
    return null;
  }
}

/** Resolve the current implementation a beacon points at. */
async function readBeaconImplementation(
  client: EvmReadClient,
  beacon: Address
): Promise<Address | null> {
  try {
    const { data } = await client.call({
      to: beacon,
      // implementation()
      data: "0x5c60da1b",
    });
    return addressFromWord(data);
  } catch {
    return null;
  }
}

export async function detectProxy(
  client: EvmReadClient,
  address: Address,
  code: Hex
): Promise<ProxyInfo | null> {
  const minimal = minimalProxyImplementation(code);
  if (minimal) {
    return {
      kind: "eip1167-minimal",
      implementation: minimal,
      admin: null,
      upgradeable: false,
    };
  }

  const implementation = await readAddressSlot(client, address, IMPLEMENTATION_SLOT);
  if (implementation) {
    return {
      kind: "eip1967",
      implementation,
      admin: await readAddressSlot(client, address, ADMIN_SLOT),
      upgradeable: true,
    };
  }

  const beacon = await readAddressSlot(client, address, BEACON_SLOT);
  if (beacon) {
    return {
      kind: "eip1967-beacon",
      implementation: await readBeaconImplementation(client, beacon),
      admin: beacon,
      upgradeable: true,
    };
  }

  const legacy = await readAddressSlot(
    client,
    address,
    ZEPPELINOS_IMPLEMENTATION_SLOT
  );
  if (legacy) {
    return {
      kind: "zeppelinos",
      implementation: legacy,
      admin: null,
      upgradeable: true,
    };
  }

  return null;
}
