import type { BlockscoutContractInfo } from "./evm/blockscout";
import type { GoPlusReport } from "./evm/goplus";
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

export function externalFindings(
  goplus: GoPlusReport | null,
  contract: BlockscoutContractInfo | null,
  existingIds: Set<string>
): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);

  // --- source verification -------------------------------------------------
  const unverified =
    contract?.isVerified === false || goplus?.isOpenSource === false;

  if (unverified) {
    add({
      id: "source-unverified",
      title: "Source code is not verified",
      severity: "medium",
      detail:
        "Nobody has published source matching this contract's deployed code, so there is nothing to read but the bytecode. Legitimate projects verify; it is free and takes minutes.",
      evidence: contract?.isVerified === false ? "Blockscout" : "GoPlus",
    });
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
      evidence: "GoPlus",
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
    if (existingIds.has(CORROBORATES[key])) continue;

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
