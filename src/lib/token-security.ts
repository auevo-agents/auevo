import { formatUnits, getAddress, isAddress, zeroAddress, type Address } from "viem";
import { robinhoodChain } from "./chains";
import { getRobinhoodClient, RpcUnavailableError } from "./evm/client";
import { isEmptyCode, OPCODE, profileBytecode } from "./evm/bytecode";
import {
  checkErc20Surface,
  detectCapabilities,
  type DetectedCapability,
} from "./evm/capabilities";
import { Deadline } from "./evm/deadline";
import { findDeployment, type DeploymentInfo } from "./evm/deployment";
import { readOwner, readTokenMetadata } from "./evm/erc20";
import { analyseHolders, type HolderDistribution } from "./evm/holders";
import { detectProxy, type ProxyInfo } from "./evm/proxy";
import {
  fetchBlockscoutContract,
  fetchBlockscoutDeployment,
  fetchBlockscoutToken,
  resolvedBlockscoutBase,
  type BlockscoutTokenInfo,
} from "./evm/blockscout";
import { fetchGoPlus } from "./evm/goplus";
import { fetchQuickIntel, quickIntelConfigured } from "./evm/quickintel";
import {
  externalFindings,
  resolveLiquidity,
  takeBackOverridesRenounce,
} from "./external-findings";
import { SEVERITY_RANK, type Finding, type Severity } from "./evm/types";

/**
 * Token security scan for Robinhood Chain.
 *
 * What this is: a read-only, best-effort risk report built from public
 * chain state — bytecode, storage, logs. What it is not: an audit, or a
 * verdict on whether a token will go up. Every scanner that has ever
 * blurred that line has eventually blessed a rug, so the report carries
 * its own limits (see `checksSkipped`) as first-class output rather than
 * as small print, and the UI shows them next to the score.
 *
 * Risks are surfaced as findings, and the score is derived from the
 * findings — never the other way round. A number nobody can trace back to
 * a specific fact is worth nothing to the person reading it.
 */

/** Total budget for the optional deep checks, leaving room inside maxDuration. */
const DEEP_CHECK_BUDGET_MS = 30_000;

const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 35,
  high: 18,
  medium: 9,
  low: 4,
  info: 0,
  good: -4,
};

const DOWNGRADE: Record<Severity, Severity> = {
  critical: "high",
  high: "medium",
  medium: "low",
  low: "low",
  info: "info",
  good: "good",
};

export type Verdict = "critical" | "high-risk" | "caution" | "low-risk";

/**
 * How much of the picture we actually got.
 *
 * Risk and confidence are separate axes and both have to be shown. The
 * score answers "how bad is what we found"; confidence answers "how much
 * did we manage to look at". Collapsing them produces the one output this
 * tool must never produce — a clean, confident-looking verdict on a token
 * whose age, distribution and source were all unknown.
 */
export type Confidence = "high" | "medium" | "low";

export type SourceStatus = "ok" | "unavailable";

export interface TokenScanReport {
  address: Address;
  chain: { id: number; name: string };
  scannedAt: string;
  headBlock: string | null;
  contract: {
    isContract: boolean;
    codeSizeBytes: number;
    /** Implementation address when this is a proxy, otherwise the token itself. */
    analysedAddress: Address;
    proxy: ProxyInfo | null;
    looksLikeErc20: boolean;
    missingErc20Functions: string[];
  };
  token: {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    totalSupplyFormatted: string | null;
  };
  ownership: {
    owner: Address;
    renounced: boolean;
    source: string;
  } | null;
  capabilities: {
    id: string;
    label: string;
    meaning: string;
    severity: Severity;
    matched: string[];
  }[];
  deployment: DeploymentInfo | null;
  holders: HolderDistribution | null;
  findings: Finding[];
  score: number;
  verdict: Verdict;
  confidence: Confidence;
  /** The major checks that came back unknown — what caps the confidence. */
  evidenceGaps: string[];
  /** Which data sources answered. Shown so a silent outage is visible. */
  sources: {
    rpc: SourceStatus;
    goplus: SourceStatus;
    blockscout: SourceStatus;
    /** The Blockscout host that answered, if any. */
    blockscoutBase: string | null;
    /** "off" means no API key is configured, which is not a failure. */
    quickIntel: SourceStatus | "off";
  };
  /** Checks that could not be completed, in plain language. */
  checksSkipped: string[];
}

export class NotAnAddressError extends Error {
  constructor() {
    super("Provide a valid Robinhood Chain contract address (0x…)");
    this.name = "NotAnAddressError";
  }
}

function scoreFrom(findings: Finding[]): number {
  const raw = findings.reduce(
    (total, finding) => total - SEVERITY_PENALTY[finding.severity],
    100
  );
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function confidenceFrom(gaps: string[]): Confidence {
  if (gaps.length === 0) return "high";
  return gaps.length === 1 ? "medium" : "low";
}

function verdictFrom(
  score: number,
  findings: Finding[],
  confidence: Confidence
): Verdict {
  const criticals = findings.filter((f) => f.severity === "critical").length;

  // A single critical finding is not something a good score should be able
  // to average away.
  if (criticals >= 2) return "critical";
  if (criticals === 1) return score < 50 ? "critical" : "high-risk";

  if (score >= 80) {
    // "Low risk" is a claim about the token. Finding nothing while unable
    // to check the things that catch rugs is a claim about our coverage,
    // and it must not be reported as the former.
    return confidence === "high" ? "low-risk" : "caution";
  }
  if (score >= 55) return "caution";
  if (score >= 30) return "high-risk";
  return "critical";
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
}

/**
 * An evidence gap is a check we attempted and could not settle; a standing
 * limitation is something this version does not attempt at all. Both are
 * published, but only gaps move the confidence, so "confidence" keeps
 * meaning "how much of what we tried actually came back".
 */
const GAP = {
  age: "Age unknown",
  distribution: "Distribution incomplete",
  sellBehaviour: "Sell behaviour unknown",
  verification: "Source verification unknown",
  liquidity: "Liquidity lock unknown",
} as const;

export async function scanToken(rawAddress: string): Promise<TokenScanReport> {
  if (!isAddress(rawAddress, { strict: false })) throw new NotAnAddressError();

  const address = getAddress(rawAddress);
  const client = getRobinhoodClient();
  const deadline = Deadline.in(DEEP_CHECK_BUDGET_MS);
  const findings: Finding[] = [];
  const checksSkipped: string[] = [];

  let code: `0x${string}` | undefined;
  let headBlock: bigint | null = null;
  try {
    [code, headBlock] = await Promise.all([
      client.getCode({ address }),
      client.getBlockNumber(),
    ]);
  } catch (err) {
    throw new RpcUnavailableError(err);
  }

  if (isEmptyCode(code)) {
    findings.push({
      id: "not-a-contract",
      title: "No contract at this address",
      severity: "critical",
      detail:
        "There is no code at this address on Robinhood Chain. It is a regular wallet, an address on a different chain, or a contract that has not been deployed yet.",
      evidence: address,
    });

    return {
      address,
      chain: { id: robinhoodChain.id, name: robinhoodChain.name },
      scannedAt: new Date().toISOString(),
      headBlock: headBlock?.toString() ?? null,
      contract: {
        isContract: false,
        codeSizeBytes: 0,
        analysedAddress: address,
        proxy: null,
        looksLikeErc20: false,
        missingErc20Functions: [],
      },
      token: {
        name: null,
        symbol: null,
        decimals: null,
        totalSupply: null,
        totalSupplyFormatted: null,
      },
      ownership: null,
      capabilities: [],
      deployment: null,
      holders: null,
      findings,
      score: 0,
      // Nothing was inconclusive here: an address with no code is a fact.
      verdict: "critical",
      confidence: "high",
      evidenceGaps: [],
      sources: {
        rpc: "ok",
        goplus: "unavailable",
        blockscout: "unavailable",
        blockscoutBase: null,
        quickIntel: quickIntelConfigured() ? "unavailable" : "off",
      },
      checksSkipped,
    };
  }

  const proxy = await detectProxy(client, address, code!);

  // On a proxy the pasted address holds a dispatcher, not the token logic.
  // Analysing it directly would report a clean contract regardless of what
  // the implementation can do.
  let analysedAddress = address;
  let analysedCode = code!;
  if (proxy?.implementation) {
    try {
      const implementationCode = await client.getCode({
        address: proxy.implementation,
      });
      if (!isEmptyCode(implementationCode)) {
        analysedAddress = proxy.implementation;
        analysedCode = implementationCode!;
      }
    } catch {
      checksSkipped.push(
        "The proxy's implementation contract could not be read, so its powers were not analysed."
      );
    }
  } else if (proxy) {
    checksSkipped.push(
      "This is a proxy but its implementation address could not be resolved, so the token's real logic was not analysed."
    );
  }

  // Kicked off here so the third-party round trips overlap the RPC work
  // below rather than adding to it. Both fetchers resolve to null on any
  // failure, so neither can reject and neither can block the scan.
  const externalLookups = Promise.all([
    fetchGoPlus(address),
    fetchBlockscoutToken(address),
    fetchBlockscoutContract(address),
    fetchQuickIntel(address),
  ]);

  const profile = profileBytecode(analysedCode);
  const erc20Surface = checkErc20Surface(profile);
  const detected = detectCapabilities(profile);

  const [metadata, ownerInfo] = await Promise.all([
    readTokenMetadata(client, address),
    readOwner(client, address),
  ]);

  const renounced = ownerInfo ? ownerInfo.owner === zeroAddress : false;
  const hasRoleAdmin = detected.some((c) => c.definition.id === "role-admin");
  // Renouncing only defuses privileged functions when nothing else can call
  // them — an upgradeable proxy or a role registry keeps them live.
  const privilegesDefused =
    renounced && !proxy?.upgradeable && !hasRoleAdmin;

  findings.push(...contractShapeFindings(proxy, erc20Surface, profile));
  findings.push(...capabilityFindings(detected, privilegesDefused));
  findings.push(...ownershipFindings(ownerInfo, renounced, privilegesDefused, detected));
  findings.push(...metadataFindings(metadata));

  const evidenceGaps: string[] = [];

  let deployment = await findDeployment(client, address, headBlock, deadline);

  let holders: HolderDistribution | null = null;
  if (metadata.totalSupply && metadata.totalSupply > 0n) {
    holders = await analyseHolders(
      client,
      address,
      metadata.totalSupply,
      headBlock,
      deployment ? BigInt(deployment.blockNumber) : null,
      deadline
    );
  }

  const [goplus, blockscoutToken, blockscoutContract, quickIntel] =
    await externalLookups;

  // The explorer has indexed what the public node cannot serve, so it
  // fills gaps the RPC pass left open — never overrides what the RPC
  // established.
  if (!deployment && blockscoutContract?.creationTxHash) {
    deployment = await deploymentFromExplorer(blockscoutContract.creationTxHash);
  }

  if (deployment) {
    findings.push(...ageFindings(deployment));
  } else {
    evidenceGaps.push(GAP.age);
    checksSkipped.push(
      "Deployment date could not be determined — neither the RPC's historical state nor the explorer answered."
    );
    findings.push({
      id: "age-unknown",
      title: "Deployment date could not be determined",
      severity: "info",
      detail:
        "We could not establish when this contract went live, so the strongest early warning there is — a token deployed hours ago — could not be checked either way.",
    });
  }

  if (blockscoutToken && metadata.totalSupply && metadata.totalSupply > 0n) {
    holders = distributionFromExplorer(blockscoutToken, metadata.totalSupply);
  }

  if (holders) findings.push(...holderFindings(holders));
  else
    checksSkipped.push(
      "Holder distribution could not be reconstructed — neither Transfer history nor the explorer returned a usable holder list."
    );

  if (!holders || holders.partial) {
    evidenceGaps.push(GAP.distribution);
    checksSkipped.push(
      "Holder distribution was read from a slice of Transfer history, not all of it, so a wallet holding most of the supply can sit outside what we scanned."
    );
  }

  // Selling is the question bytecode cannot answer, so it is a gap only
  // when the simulation source stayed silent.
  if (goplus?.isHoneypot == null && quickIntel?.isHoneypot == null) {
    evidenceGaps.push(GAP.sellBehaviour);
    checksSkipped.push(
      "No sell was simulated for this token, so a contract that blocks selling only at execution time — a honeypot — cannot be ruled out."
    );
  }

  if (
    blockscoutContract?.isVerified == null &&
    goplus?.isOpenSource == null &&
    quickIntel?.contractVerified == null
  ) {
    evidenceGaps.push(GAP.verification);
    checksSkipped.push(
      "Whether the published source matches the deployed bytecode could not be established."
    );
  }

  // Same pattern as the two checks above: GoPlus is attempted by default,
  // so this is a gap whenever it (and Quick Intel, once it covers this
  // chain) came back with nothing — never a "not attempted" limitation.
  if (resolveLiquidity(goplus, quickIntel).secured === null) {
    evidenceGaps.push(GAP.liquidity);
    checksSkipped.push(
      "Whether the liquidity pool is locked or burned could not be established from any configured audit source."
    );
  }

  findings.push(
    ...externalFindings(
      goplus,
      blockscoutContract,
      quickIntel,
      new Set(findings.map((finding) => finding.id))
    )
  );

  if (metadata.totalSupply === 0n) {
    findings.push({
      id: "zero-supply",
      title: "Total supply is zero",
      severity: "medium",
      detail:
        "Nothing has been minted yet. Either the token is not live, or supply is created later — in which case whoever can mint decides the entire distribution.",
    });
  }

  const sorted = sortFindings(takeBackOverridesRenounce(findings, goplus));
  const score = scoreFrom(sorted);
  const confidence = confidenceFrom(evidenceGaps);

  return {
    address,
    chain: { id: robinhoodChain.id, name: robinhoodChain.name },
    scannedAt: new Date().toISOString(),
    headBlock: headBlock.toString(),
    contract: {
      isContract: true,
      codeSizeBytes: profile.sizeBytes,
      analysedAddress,
      proxy,
      looksLikeErc20: erc20Surface.looksLikeErc20,
      missingErc20Functions: erc20Surface.missing,
    },
    token: {
      name: metadata.name?.display ?? null,
      symbol: metadata.symbol?.display ?? null,
      decimals: metadata.decimals,
      totalSupply: metadata.totalSupply?.toString() ?? null,
      totalSupplyFormatted:
        metadata.totalSupply !== null && metadata.decimals !== null
          ? formatUnits(metadata.totalSupply, metadata.decimals)
          : null,
    },
    ownership: ownerInfo
      ? { owner: ownerInfo.owner, renounced, source: ownerInfo.source }
      : null,
    capabilities: detected.map(({ definition, matched }) => ({
      id: definition.id,
      label: definition.label,
      meaning: definition.meaning,
      severity: definition.severity,
      matched,
    })),
    deployment,
    holders,
    findings: sorted,
    score,
    verdict: verdictFrom(score, sorted, confidence),
    confidence,
    evidenceGaps,
    sources: {
      rpc: "ok",
      goplus: goplus ? "ok" : "unavailable",
      blockscout: blockscoutToken || blockscoutContract ? "ok" : "unavailable",
      // Which host answered, so a silently wrong endpoint is visible on
      // the page instead of only in a log nobody reads.
      blockscoutBase: resolvedBlockscoutBase(),
      quickIntel: quickIntel ? "ok" : quickIntelConfigured() ? "unavailable" : "off",
    },
    checksSkipped,
  };
}

/** Deployment date from the explorer, when the node cannot serve it. */
async function deploymentFromExplorer(
  creationTxHash: string
): Promise<DeploymentInfo | null> {
  const creation = await fetchBlockscoutDeployment(creationTxHash);
  if (!creation) return null;

  return {
    blockNumber: creation.blockNumber ?? "0",
    timestamp: creation.timestamp,
    ageDays: Math.max(0, (Date.now() / 1000 - creation.timestamp) / 86_400),
  };
}

/**
 * Distribution from the explorer's index. Unlike the log-derived version
 * this is a ranked list over every holder, so it is not partial — that
 * flag exists to mark a window, and there is no window here.
 */
function distributionFromExplorer(
  token: BlockscoutTokenInfo,
  totalSupply: bigint
): HolderDistribution {
  const burn = new Set([
    "0x000000000000000000000000000000000000dEaD".toLowerCase(),
    "0x0000000000000000000000000000000000000001".toLowerCase(),
    "0x0000000000000000000000000000000000000000".toLowerCase(),
  ]);

  const share = (value: bigint) =>
    totalSupply > 0n ? Number((value * 1_000_000n) / totalSupply) / 10_000 : 0;

  let burned = 0n;
  const holders = [];

  for (const holder of token.holders) {
    let balance: bigint;
    try {
      balance = BigInt(holder.balance);
    } catch {
      continue;
    }
    if (balance <= 0n) continue;

    if (burn.has(holder.address.toLowerCase())) {
      burned += balance;
      continue;
    }

    holders.push({
      address: holder.address,
      balance: holder.balance,
      percent: share(balance),
    });
  }

  const top = holders.slice(0, 10);

  return {
    scannedRanges: [],
    blocksScanned: "0",
    partial: false,
    candidatesConsidered: token.holderCount ?? token.holders.length,
    top,
    topPercent: top[0]?.percent ?? 0,
    top10Percent: top.reduce((sum, holder) => sum + holder.percent, 0),
    burnedPercent: share(burned),
    usedMulticall: false,
  };
}

function contractShapeFindings(
  proxy: ProxyInfo | null,
  surface: ReturnType<typeof checkErc20Surface>,
  profile: ReturnType<typeof profileBytecode>
): Finding[] {
  const findings: Finding[] = [];

  if (!surface.looksLikeErc20) {
    findings.push({
      id: "not-erc20",
      title: "Does not look like an ERC-20 token",
      severity: "high",
      detail:
        "The standard token functions are missing from this contract's code. Whatever it is, wallets and DEXs will not treat it as a normal token.",
      evidence: `missing: ${surface.missing.join(", ")}`,
    });
  }

  if (proxy?.upgradeable) {
    findings.push({
      id: "upgradeable-proxy",
      title: "Token logic can be replaced",
      severity: "critical",
      detail:
        "This address is an upgradeable proxy. Whoever controls the upgrade can swap the code behind it at any time, so anything that looks safe right now can be changed after you buy.",
      evidence: `${proxy.kind}${proxy.admin ? ` · admin ${proxy.admin}` : ""}`,
    });
  } else if (proxy?.kind === "eip1167-minimal") {
    findings.push({
      id: "minimal-proxy",
      title: "Fixed-logic proxy",
      severity: "info",
      detail:
        "This is a minimal proxy: it forwards to another contract, but that target is written into its code and cannot be changed. The analysis below is of the contract it points at.",
      evidence: proxy.implementation ?? undefined,
    });
  } else if (profile.opcodes.has(OPCODE.DELEGATECALL)) {
    findings.push({
      id: "unrecognised-delegatecall",
      title: "Runs code from another contract",
      severity: "medium",
      detail:
        "The contract uses delegatecall but does not match a standard proxy pattern, so part of its behaviour lives in code this scan could not locate and check.",
    });
  }

  if (profile.opcodes.has(OPCODE.SELFDESTRUCT)) {
    findings.push({
      id: "selfdestruct",
      title: "Contract can destroy itself",
      severity: "high",
      detail:
        "A selfdestruct path is present in the code. If it is reachable, the contract can be wiped, taking the token with it.",
    });
  }

  return findings;
}

function capabilityFindings(
  detected: DetectedCapability[],
  privilegesDefused: boolean
): Finding[] {
  return detected
    // Ownership and role plumbing are reported through the ownership
    // findings instead, where the state that decides what they mean lives.
    .filter(({ definition }) => definition.severity !== "info")
    .map(({ definition, matched }) => ({
      id: `capability-${definition.id}`,
      title: definition.label,
      severity: privilegesDefused
        ? DOWNGRADE[definition.severity]
        : definition.severity,
      detail: privilegesDefused
        ? `${definition.meaning} Ownership is renounced, which should make this unreachable — but only if no other role or modifier can still call it.`
        : definition.meaning,
      evidence: matched.join(", "),
    }));
}

function ownershipFindings(
  ownerInfo: Awaited<ReturnType<typeof readOwner>>,
  renounced: boolean,
  privilegesDefused: boolean,
  detected: DetectedCapability[]
): Finding[] {
  const hasPrivilegedPowers = detected.some(
    ({ definition }) => definition.severity !== "info"
  );

  if (!ownerInfo) {
    return [
      {
        id: "no-owner-function",
        title: "No owner function",
        severity: "info",
        detail:
          "The contract does not expose an owner. That is a good sign on its own, though privileged functions can still be gated some other way.",
      },
    ];
  }

  if (renounced) {
    return [
      {
        id: "ownership-renounced",
        title: privilegesDefused
          ? "Ownership renounced"
          : "Ownership renounced, but control remains",
        severity: privilegesDefused ? "good" : "medium",
        detail: privilegesDefused
          ? "The owner is set to the zero address, so owner-only functions can no longer be called."
          : "The owner is the zero address, but the contract is still upgradeable or uses roles — so renouncing ownership did not actually give up control.",
        evidence: ownerInfo.source,
      },
    ];
  }

  return [
    {
      id: "ownership-active",
      title: "Contract has an active owner",
      severity: hasPrivilegedPowers ? "medium" : "low",
      detail: hasPrivilegedPowers
        ? "One address still holds owner privileges over the powers listed above. Everything those functions allow is one transaction away."
        : "One address still holds ownership. No high-risk owner-only powers were found in the code.",
      evidence: `${ownerInfo.owner} (${ownerInfo.source})`,
    },
  ];
}

function metadataFindings(
  metadata: Awaited<ReturnType<typeof readTokenMetadata>>
): Finding[] {
  const issues = [
    ...(metadata.name?.issues ?? []),
    ...(metadata.symbol?.issues ?? []),
  ];

  if (issues.length === 0) return [];

  return [
    {
      id: "disguised-metadata",
      title: "Token name or symbol is disguised",
      severity: "high",
      detail:
        "The name or symbol contains hidden characters. This is used to make a token render like a well-known one in wallets and listings.",
      evidence: [...new Set(issues)].join("; "),
    },
  ];
}

function ageFindings(deployment: DeploymentInfo): Finding[] {
  if (deployment.ageDays === null) return [];

  if (deployment.ageDays < 1) {
    return [
      {
        id: "very-new-contract",
        title: "Deployed less than a day ago",
        severity: "high",
        detail:
          "This contract is hours old. Nothing about it has been tested by time, and most rug pulls happen within the first day.",
        evidence: `block ${deployment.blockNumber}`,
      },
    ];
  }

  if (deployment.ageDays < 7) {
    return [
      {
        id: "new-contract",
        title: `Deployed ${Math.floor(deployment.ageDays)} day(s) ago`,
        severity: "medium",
        detail:
          "This contract is less than a week old, so there is very little history to judge it on.",
        evidence: `block ${deployment.blockNumber}`,
      },
    ];
  }

  return [];
}

function holderFindings(holders: HolderDistribution): Finding[] {
  const findings: Finding[] = [];
  const caveat = holders.partial
    ? " Distribution was reconstructed from a partial log scan, so the real concentration can only be higher, never lower."
    : "";

  if (holders.topPercent >= 50) {
    findings.push({
      id: "holder-concentration-extreme",
      title: `One wallet holds ${holders.topPercent.toFixed(1)}% of supply`,
      severity: "high",
      detail: `A single address can move the price at will, or exit into whatever liquidity exists.${caveat}`,
      evidence: holders.top[0]?.address,
    });
  } else if (holders.topPercent >= 25) {
    findings.push({
      id: "holder-concentration-high",
      title: `Largest wallet holds ${holders.topPercent.toFixed(1)}% of supply`,
      severity: "medium",
      detail: `Supply is concentrated enough that one holder selling would move the price hard.${caveat}`,
      evidence: holders.top[0]?.address,
    });
  }

  if (holders.top10Percent >= 90 && holders.top.length >= 3) {
    findings.push({
      id: "top10-concentration",
      title: `Top holders hold ${holders.top10Percent.toFixed(1)}% of supply`,
      severity: "medium",
      detail: `Almost the entire supply sits in a handful of wallets.${caveat}`,
    });
  }

  if (holders.burnedPercent >= 50) {
    findings.push({
      id: "supply-burned",
      title: `${holders.burnedPercent.toFixed(1)}% of supply is burned`,
      severity: "good",
      detail:
        "A majority of supply sits at a burn address and is out of circulation for good.",
    });
  }

  return findings;
}
