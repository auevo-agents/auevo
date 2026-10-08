import type { BlockscoutContractInfo } from "./evm/blockscout";
import type { GoPlusReport } from "./evm/goplus";
import type { QuickIntelReport } from "./evm/quickintel";
import type { Finding } from "./evm/types";

/**
 * Turning a second opinion into findings.
 *
 * One rule decides everything here: an external source may add a risk or
 * corroborate one, never clear one. Nothing in this file can delete a
 * finding derived from the contract's own bytecode, and nothing can raise
 * a score. The reason is the failure mode it prevents — a scam token whose
 * third-party record happens to be empty would otherwise come back cleaner
 * than one nobody has ever looked at.
 *
 * The one place an external source rewrites our own finding is
 * `takeBackOverridesRenounce`, and it only ever makes the report worse.
 */

/** What our own analysis already covers, so a second opinion isn't printed twice. */
const CORROBORATES: Record<string, string> = {
  mint: "capability-mint",
  pause: "capability-pause",
  blacklist: "capability-blacklist",
  proxy: "upgradeable-proxy",
  selfdestruct: "selfdestruct",
};

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export interface LiquidityCoverage {
  /** Combined burned + locked percent, 0-100, or null if neither source answered. */
  secured: number | null;
  source: string;
}

/**
 * Prefers GoPlus, since it is the source actually confirmed to cover this
 * chain; Quick Intel is read as a fallback for if or when it adds
 * coverage, without a code change on this side when it does. The two are
 * not combined even when both answer — they would be describing the same
 * LP supply, and summing two answers to the same question invites double
 * counting rather than confidence.
 */
export function resolveLiquidity(
  goplus: GoPlusReport | null,
  quickIntel: QuickIntelReport | null
): LiquidityCoverage {
  const fromGoPlus =
    goplus && (goplus.lpBurnedPercent !== null || goplus.lpLockedPercent !== null)
      ? { burned: goplus.lpBurnedPercent, locked: goplus.lpLockedPercent, source: "GoPlus" }
      : null;

  const fromQuickIntel =
    !fromGoPlus &&
    quickIntel &&
    (quickIntel.lpBurnedPercent !== null || quickIntel.lpLockedPercent !== null)
      ? {
          burned: quickIntel.lpBurnedPercent,
          locked: quickIntel.lpLockedPercent,
          source: "Quick Intel",
        }
      : null;

  const resolved = fromGoPlus ?? fromQuickIntel;
  if (!resolved) return { secured: null, source: "" };

  return {
    secured: (resolved.burned ?? 0) + (resolved.locked ?? 0),
    source: resolved.source,
  };
}

export function externalFindings(
  goplus: GoPlusReport | null,
  contract: BlockscoutContractInfo | null,
  quickIntel: QuickIntelReport | null,
  existingIds: Set<string>
): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set(existingIds);

  /** Two sources agreeing is not a reason to print the same finding twice. */
  const add = (finding: Finding) => {
    if (seen.has(finding.id)) return;
    seen.add(finding.id);
    findings.push(finding);
  };

  // --- source verification -------------------------------------------------
  const unverifiedBy =
    contract?.isVerified === false
      ? "Blockscout"
      : goplus?.isOpenSource === false
        ? "GoPlus"
        : quickIntel?.contractVerified === false
          ? "Quick Intel"
          : null;

  if (unverifiedBy) {
    add({
      id: "source-unverified",
      title: "Source code is not verified",
      severity: "medium",
      detail:
        "Nobody has published source matching this contract's deployed code, so there is nothing to read but the bytecode. Legitimate projects verify; it is free and takes minutes.",
      evidence: unverifiedBy,
    });
  }

  // --- liquidity -------------------------------------------------------
  const liquidity = resolveLiquidity(goplus, quickIntel);

  if (liquidity.secured !== null) {
    if (liquidity.secured >= 90) {
      add({
        id: "liquidity-secured",
        title: `${liquidity.secured.toFixed(0)}% of liquidity is burned or locked`,
        severity: "good",
        detail:
          "The pool backing this token cannot simply be withdrawn, which removes the most common way a token goes to zero in one transaction.",
        evidence: liquidity.source,
      });
    } else if (liquidity.secured < 10) {
      add({
        id: "liquidity-unlocked",
        title: "Liquidity is neither locked nor burned",
        severity: "high",
        detail:
          "Whoever owns the pool can pull it at any moment, which takes the price to zero and leaves holders with tokens nobody can sell.",
        evidence: liquidity.source,
      });
    }
  }

  if (quickIntel) {
    if (quickIntel.isHoneypot === true) {
      add({
        id: "honeypot",
        title: "Selling fails in simulation",
        severity: "critical",
        detail:
          "A simulated sell did not go through. This is the signature of a honeypot: money goes in and does not come out.",
        evidence: "Quick Intel",
      });
    }

    const quickIntelPowers: [string, boolean | null][] = [
      ["mint", quickIntel.canMint],
      ["blacklist", quickIntel.canBlacklist],
      ["pause", quickIntel.canPauseTrading],
    ];

    for (const [key, flagged] of quickIntelPowers) {
      if (flagged !== true || seen.has(CORROBORATES[key])) continue;
      add({
        id: `external-${key}`,
        title: `${key[0].toUpperCase() + key.slice(1)} reported by Quick Intel`,
        severity: key === "blacklist" ? "critical" : "high",
        detail:
          "An established auditor reports this power on the contract while our own bytecode pass did not find it. Treat it as present — it may sit behind code we could not resolve.",
        evidence: "Quick Intel",
      });
    }

    if (quickIntel.hiddenOwner === true) {
      add({
        id: "hidden-owner",
        title: "Hidden owner",
        severity: "critical",
        detail:
          "Control is held through an address the contract does not report as the owner. Whatever the owner field says, someone else still has the keys.",
        evidence: "Quick Intel",
      });
    }
  }

  if (!goplus) return findings;

  // --- the question static analysis cannot answer --------------------------
  if (goplus.isHoneypot === true) {
    add({
      id: "honeypot",
      title: "Selling fails in simulation",
      severity: "critical",
      detail:
        "A simulated buy succeeded and the matching sell did not. This is the signature of a honeypot: money goes in and does not come out.",
      evidence: "GoPlus sell simulation",
    });
  }

  if (goplus.cannotSellAll === true) {
    add({
      id: "cannot-sell-all",
      title: "You cannot sell your whole position",
      severity: "high",
      detail:
        "The contract refuses a sell of the full balance. Partial exits may work while a complete one never does.",
      evidence: "GoPlus sell simulation",
    });
  }

  if (goplus.sellTax !== null && goplus.sellTax >= 0.05) {
    add({
      id: "sell-tax",
      title: `Sell tax of ${percent(goplus.sellTax)}`,
      severity:
        goplus.sellTax >= 0.5 ? "critical" : goplus.sellTax >= 0.15 ? "high" : "medium",
      detail:
        goplus.sellTax >= 0.5
          ? "At this level the tax is a sell block in all but name — most of what you take out is kept by the contract."
          : "A meaningful cut of every sale goes to the contract rather than to you.",
      evidence: "GoPlus",
    });
  }

  if (goplus.buyTax !== null && goplus.buyTax >= 0.15) {
    add({
      id: "buy-tax",
      title: `Buy tax of ${percent(goplus.buyTax)}`,
      severity: "medium",
      detail: "A large slice of every purchase is taken before you hold anything.",
      evidence: "GoPlus",
    });
  }

  if (goplus.slippageModifiable === true) {
    add({
      id: "slippage-modifiable",
      title: "Tax can be changed after you buy",
      severity: "high",
      detail:
        "The transfer fee is adjustable. A tax that is harmless today can be raised to block selling once enough people are in.",
      evidence: "GoPlus",
    });
  }

  if (goplus.hiddenOwner === true) {
    add({
      id: "hidden-owner",
      title: "Hidden owner",
      severity: "critical",
      detail:
        "Control is held through an address the contract does not report as the owner. Whatever the owner field says, someone else still has the keys.",
      evidence: "GoPlus",
    });
  }

  if (goplus.ownerChangeBalance === true) {
    add({
      id: "owner-change-balance",
      title: "Owner can rewrite any balance directly",
      severity: "critical",
      detail:
        "The owner can set an arbitrary address's balance to whatever they choose — including zeroing out yours — without a transfer or a mint. This is a step beyond minting: it does not just dilute holders, it can erase a specific one.",
      evidence: "GoPlus",
    });
  }

  if (goplus.externalCall === true) {
    add({
      id: "external-call",
      title: "Transfers call into another contract",
      severity: "medium",
      detail:
        "A transfer on this token executes code in a separate contract. That contract is outside what this scan analysed, so behaviour can live there that neither this report nor a quick read of this contract alone would catch.",
      evidence: "GoPlus",
    });
  }

  if (goplus.canTakeBackOwnership === true) {
    add({
      id: "ownership-reclaimable",
      title: "Ownership can be taken back",
      severity: "critical",
      detail:
        "The contract contains a path to restore ownership after it was given up. A renouncement that can be reversed protects nobody.",
      evidence: "GoPlus",
    });
  }

  if (goplus.tradingCooldown === true) {
    add({
      id: "trading-cooldown",
      title: "Trading cooldown enforced",
      severity: "medium",
      detail:
        "The contract limits how often an address can trade, which can be used to hold holders in place during a sell-off.",
      evidence: "GoPlus",
    });
  }

  if (goplus.antiWhaleModifiable === true) {
    add({
      id: "anti-whale-modifiable",
      title: "Transaction limits can be changed",
      severity: "medium",
      detail:
        "Maximum transaction or wallet size is adjustable after launch, so exit size can be tightened later.",
      evidence: "GoPlus",
    });
  }

  if (goplus.creatorPercent !== null && goplus.creatorPercent >= 0.3) {
    add({
      id: "creator-holds-supply",
      title: `Creator holds ${percent(goplus.creatorPercent)} of supply`,
      severity: goplus.creatorPercent >= 0.5 ? "high" : "medium",
      detail:
        "The deploying wallet still holds a large share of the supply and can exit into whatever liquidity exists.",
      evidence: goplus.creatorAddress ?? "GoPlus",
    });
  }

  // --- second opinion on what we already checked ---------------------------
  const corroborated: [string, boolean | null][] = [
    ["mint", goplus.isMintable],
    ["pause", goplus.transferPausable],
    ["blacklist", goplus.isBlacklisted],
    ["proxy", goplus.isProxy],
    ["selfdestruct", goplus.selfdestruct],
  ];

  for (const [key, flagged] of corroborated) {
    if (flagged !== true) continue;
    if (seen.has(CORROBORATES[key])) continue;

    // Flagged by GoPlus but not by us: the power is real and lives
    // somewhere our bytecode pass could not see.
    add({
      id: `external-${key}`,
      title: `${key === "selfdestruct" ? "Self-destruct" : key[0].toUpperCase() + key.slice(1)} reported by GoPlus`,
      severity: key === "blacklist" ? "critical" : "high",
      detail:
        "An established scanner reports this power on the contract while our own bytecode pass did not find it. Treat it as present — it may sit behind code we could not resolve.",
      evidence: "GoPlus",
    });
  }

  return findings;
}

/**
 * "Ownership renounced" is reported as a good thing. If ownership can be
 * reclaimed, it isn't one — so the positive finding is rewritten rather
 * than left standing next to the critical one that contradicts it.
 */
export function takeBackOverridesRenounce(
  findings: Finding[],
  goplus: GoPlusReport | null
): Finding[] {
  if (goplus?.canTakeBackOwnership !== true) return findings;

  return findings.map((finding) =>
    finding.id === "ownership-renounced"
      ? {
          ...finding,
          severity: "medium" as const,
          title: "Ownership renounced, but reclaimable",
          detail:
            "The owner is the zero address, but the contract contains a path to take ownership back. The renouncement is not final.",
        }
      : finding
  );
}
