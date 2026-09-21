import {
  decodeAbiParameters,
  encodeAbiParameters,
  hexToBigInt,
  hexToString,
  size,
  toFunctionSelector,
  trim,
  type Address,
  type Hex,
} from "viem";
import type { RobinhoodClient } from "./client";

/**
 * ERC-20 reads that tolerate tokens which do not quite follow the standard.
 *
 * Two things are deliberate here. Every field is read independently, so a
 * contract that reverts on decimals() still reports its name and supply
 * instead of failing the whole scan. And name/symbol fall back to the
 * pre-standard bytes32 encoding, which predates the string return type
 * and is still shipped by contracts copied from old sources.
 */

const SELECTOR = {
  name: toFunctionSelector("name()"),
  symbol: toFunctionSelector("symbol()"),
  decimals: toFunctionSelector("decimals()"),
  totalSupply: toFunctionSelector("totalSupply()"),
  owner: toFunctionSelector("owner()"),
  getOwner: toFunctionSelector("getOwner()"),
  balanceOf: toFunctionSelector("balanceOf(address)"),
} as const;

async function rawCall(
  client: RobinhoodClient,
  to: Address,
  data: Hex
): Promise<Hex | null> {
  try {
    const { data: result } = await client.call({ to, data });
    return result && result !== "0x" ? result : null;
  } catch {
    // A revert here is information, not an error: it means the contract
    // does not implement this function.
    return null;
  }
}

function decodeString(raw: Hex): string | null {
  try {
    const [value] = decodeAbiParameters([{ type: "string" }], raw);
    if (typeof value === "string") return value;
  } catch {
    // Not an ABI-encoded string — fall through to the bytes32 form.
  }

  if (size(raw) === 32) {
    try {
      return hexToString(trim(raw, { dir: "right" }));
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Token names are attacker-controlled text. React escapes them, so this is
 * not about injection — it is about disguises: zero-width characters and
 * right-to-left overrides let a scam token render as a well-known one, and
 * a kilobyte-long name exists only to break the page it is shown on.
 */
const CONTROL_CHARS = "\\u0000-\\u001f\\u007f-\\u009f";
const INVISIBLE_CHARS =
  "\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2060-\\u2064\\ufeff";

// Separate test and replace regexes on purpose: a /g regex carries
// lastIndex between .test() calls, which makes every other call return
// false on the same input.
const HAS_CONTROL = new RegExp(`[${CONTROL_CHARS}]`);
const HAS_INVISIBLE = new RegExp(`[${INVISIBLE_CHARS}]`);
const STRIP_UNSAFE = new RegExp(`[${CONTROL_CHARS}${INVISIBLE_CHARS}]`, "g");

const MAX_TEXT_LENGTH = 64;

export interface InspectedText {
  /** Safe to render. */
  display: string;
  /** Why the original was considered disguised, if it was. */
  issues: string[];
}

export function inspectTokenText(raw: string | null): InspectedText | null {
  if (raw === null) return null;

  const issues: string[] = [];
  if (HAS_CONTROL.test(raw)) issues.push("contains control characters");
  if (HAS_INVISIBLE.test(raw)) {
    issues.push("contains invisible or direction-override characters");
  }
  if (raw.length > MAX_TEXT_LENGTH) issues.push("unusually long");

  const display = raw.replace(STRIP_UNSAFE, "").trim().slice(0, MAX_TEXT_LENGTH);

  return { display, issues };
}

export interface TokenMetadata {
  name: InspectedText | null;
  symbol: InspectedText | null;
  decimals: number | null;
  totalSupply: bigint | null;
}

export async function readTokenMetadata(
  client: RobinhoodClient,
  token: Address
): Promise<TokenMetadata> {
  const [nameRaw, symbolRaw, decimalsRaw, supplyRaw] = await Promise.all([
    rawCall(client, token, SELECTOR.name),
    rawCall(client, token, SELECTOR.symbol),
    rawCall(client, token, SELECTOR.decimals),
    rawCall(client, token, SELECTOR.totalSupply),
  ]);

  let decimals: number | null = null;
  if (decimalsRaw) {
    const value = hexToBigInt(decimalsRaw);
    // Anything past 77 cannot be a real decimals value; clamp rather than
    // trust it, so downstream formatting can't be driven into nonsense.
    decimals = value <= 77n ? Number(value) : null;
  }

  return {
    name: nameRaw ? inspectTokenText(decodeString(nameRaw)) : null,
    symbol: symbolRaw ? inspectTokenText(decodeString(symbolRaw)) : null,
    decimals,
    totalSupply: supplyRaw ? hexToBigInt(supplyRaw) : null,
  };
}

export interface OwnerInfo {
  owner: Address;
  /** Which getter answered — contracts differ on the spelling. */
  source: "owner()" | "getOwner()";
}

export async function readOwner(
  client: RobinhoodClient,
  token: Address
): Promise<OwnerInfo | null> {
  const attempts = [
    { data: SELECTOR.owner, source: "owner()" as const },
    { data: SELECTOR.getOwner, source: "getOwner()" as const },
  ];

  for (const attempt of attempts) {
    const raw = await rawCall(client, token, attempt.data);
    if (!raw || size(raw) < 32) continue;
    try {
      const [owner] = decodeAbiParameters([{ type: "address" }], raw);
      return { owner: owner as Address, source: attempt.source };
    } catch {
      continue;
    }
  }

  return null;
}

export function balanceOfCalldata(holder: Address): Hex {
  return `${SELECTOR.balanceOf}${encodeAbiParameters(
    [{ type: "address" }],
    [holder]
  ).slice(2)}` as Hex;
}

export async function readBalanceOf(
  client: RobinhoodClient,
  token: Address,
  holder: Address
): Promise<bigint | null> {
  const raw = await rawCall(client, token, balanceOfCalldata(holder));
  return raw ? hexToBigInt(raw) : null;
}
