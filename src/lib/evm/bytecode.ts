import { hexToBytes, type Hex } from "viem";

/**
 * Offline analysis of EVM runtime bytecode.
 *
 * Everything here is pure — it answers "what can this contract do" from
 * the code eth_getCode returned, with no further RPC calls.
 *
 * The bytecode is walked as instructions rather than scanned as a string.
 * That matters: a plain substring search for a 4-byte selector or a
 * one-byte opcode also matches constants, ABI-encoded data and the CBOR
 * metadata trailer, which is how naive scanners end up reporting
 * SELFDESTRUCT on contracts that have no such code path. Skipping PUSH
 * immediates removes that whole class of false positive.
 */

const PUSH1 = 0x60;
const PUSH32 = 0x7f;

/** Opcodes worth reporting on. */
export const OPCODE = {
  DELEGATECALL: 0xf4,
  CALLCODE: 0xf2,
  SELFDESTRUCT: 0xff,
  CREATE: 0xf0,
  CREATE2: 0xf5,
} as const;

/** Guard against a pathological eth_getCode response; real runtime code is <= 24KB. */
const MAX_CODE_BYTES = 256 * 1024;

export interface BytecodeProfile {
  /** Runtime code size in bytes, metadata trailer included. */
  sizeBytes: number;
  /**
   * Every PUSH4 immediate in the code. This is a superset of the
   * contract's function selectors — the dispatcher pushes each selector
   * to compare against calldata — and can include unrelated constants,
   * so presence is strong evidence and absence is stronger.
   */
  selectors: ReadonlySet<string>;
  /** Opcodes sitting at instruction positions (PUSH data excluded). */
  opcodes: ReadonlySet<number>;
  /** Whether the Solidity CBOR metadata trailer was recognised and skipped. */
  metadataStripped: boolean;
}

export function isEmptyCode(code: Hex | undefined | null): boolean {
  return !code || code === "0x" || code === "0x0";
}

/**
 * Solidity appends a CBOR blob (compiler version, source hash) after the
 * executable code, ending with its own two-byte big-endian length. It is
 * data, never reached by execution, so it is cut before the walk.
 */
function stripMetadata(bytes: Uint8Array): {
  body: Uint8Array;
  stripped: boolean;
} {
  if (bytes.length < 4) return { body: bytes, stripped: false };

  const metaLength = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
  const start = bytes.length - 2 - metaLength;

  // A CBOR map header (0xa1-0xaf) at the computed offset is what makes this
  // a metadata trailer rather than a coincidental pair of trailing bytes.
  if (metaLength > 0 && start > 0 && bytes[start] >= 0xa1 && bytes[start] <= 0xaf) {
    return { body: bytes.subarray(0, start), stripped: true };
  }

  return { body: bytes, stripped: false };
}

function toSelector(bytes: Uint8Array): string {
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

export function profileBytecode(code: Hex): BytecodeProfile {
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(code);
  } catch {
    return {
      sizeBytes: 0,
      selectors: new Set(),
      opcodes: new Set(),
      metadataStripped: false,
    };
  }

  if (bytes.length > MAX_CODE_BYTES) bytes = bytes.subarray(0, MAX_CODE_BYTES);

  const { body, stripped } = stripMetadata(bytes);
  const selectors = new Set<string>();
  const opcodes = new Set<number>();

  for (let i = 0; i < body.length; ) {
    const op = body[i];
    opcodes.add(op);

    if (op >= PUSH1 && op <= PUSH32) {
      const pushLength = op - PUSH1 + 1;
      if (pushLength === 4 && i + 5 <= body.length) {
        selectors.add(toSelector(body.subarray(i + 1, i + 5)));
      }
      i += 1 + pushLength;
    } else {
      i += 1;
    }
  }

  return {
    sizeBytes: bytes.length,
    selectors,
    opcodes,
    metadataStripped: stripped,
  };
}
