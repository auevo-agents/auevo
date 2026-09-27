"use client";

import { useMemo, useState } from "react";
import { formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { ERC4626_ABI } from "@/lib/erc4626-abi";
import { USDG, USDG_DECIMALS } from "@/lib/rwa/dex/addresses";
import { MORPHO_USDG_VAULTS, type MorphoVault } from "@/lib/rwa/morpho-vaults";
import { CopyableAddress } from "../copyable-address";
import { BrandIcon } from "../brand-icon";

function formatUsdg(value: bigint | undefined): string {
  if (typeof value !== "bigint") return "—";
  const n = Number(formatUnits(value, USDG_DECIMALS));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

/**
 * A curated Morpho USDG vault, deposit/withdraw live on Robinhood Chain —
 * real transactions against Morpho's own already-deployed, already-
 * audited ERC-4626 vault contract, same trust model as Swap (SwapRouter02)
 * and LP (NonfungiblePositionManager): this UI is ours, the money movement
 * runs entirely in Morpho's contract, nothing here ever custodies a token.
 */
function VaultCard({ vault }: { vault: MorphoVault }) {
  const { address: account } = useAccount();
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");

  const reads = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: vault.address, abi: ERC4626_ABI, functionName: "totalAssets" },
      account && { address: vault.address, abi: ERC4626_ABI, functionName: "balanceOf", args: [account] },
      account && { address: USDG, abi: ERC20_ABI, functionName: "balanceOf", args: [account] },
      account && { address: USDG, abi: ERC20_ABI, functionName: "allowance", args: [account, vault.address] },
    ].filter(Boolean) as never[],
    query: { enabled: true },
  });
  const [totalAssets, myShares, usdgBalance, allowance] = reads.data?.map((r) => r.result) ?? [];

  const myPosition = useReadContracts({
    allowFailure: true,
    contracts: [
      typeof myShares === "bigint" && myShares > 0n
        ? { address: vault.address, abi: ERC4626_ABI, functionName: "convertToAssets", args: [myShares] }
        : undefined,
    ].filter(Boolean) as never[],
    query: { enabled: typeof myShares === "bigint" && myShares > 0n },
  });
  const myAssets = myPosition.data?.[0]?.result as bigint | undefined;

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const action = useWriteContract();
  const actionReceipt = useWaitForTransactionReceipt({ hash: action.data });

  const parsedAmount = useMemo(() => {
    if (!amount) return null;
    try {
      const n = parseUnits(amount, USDG_DECIMALS);
      return n > 0n ? n : null;
    } catch {
      return null;
    }
  }, [amount]);

  const needsApproval =
    mode === "deposit" && parsedAmount !== null && typeof allowance === "bigint" ? allowance < parsedAmount : false;

  function handleApprove() {
    approve.writeContract({
      address: USDG,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [vault.address, maxUint256],
    });
  }

  function handleAction() {
    if (!account || !parsedAmount) return;
    if (mode === "deposit") {
      action.writeContract({
        address: vault.address,
        abi: ERC4626_ABI,
        functionName: "deposit",
        args: [parsedAmount, account],
      });
    } else {
      action.writeContract({
        address: vault.address,
        abi: ERC4626_ABI,
        functionName: "withdraw",
        args: [parsedAmount, account, account],
      });
    }
  }

  function handleWithdrawAll() {
    if (!account || typeof myShares !== "bigint" || myShares === 0n) return;
    action.writeContract({
      address: vault.address,
      abi: ERC4626_ABI,
      functionName: "redeem",
      args: [myShares, account, account],
    });
  }

  return (
    <div className="earn-vault-card">
      <div className="earn-vault-head">
        <BrandIcon symbol="USDG" kind="ticker" size={30} />
        <div className="earn-vault-name">
          <b>{vault.name}</b>
          <small>Curated by {vault.curator} · Morpho, Robinhood Chain</small>
        </div>
        <div className="earn-vault-tvl">
          <span>{formatUsdg(totalAssets as bigint | undefined)} USDG</span>
          <small>TVL</small>
        </div>
      </div>

      {account && (
        <div className="earn-vault-position">
          Your position: <b>{formatUsdg(myAssets)} USDG</b>
          {typeof myShares === "bigint" && myShares > 0n && (
            <button className="app-link-button" onClick={handleWithdrawAll} disabled={action.isPending}>
              Withdraw all
            </button>
          )}
        </div>
      )}

      <div className="desk-tabs">
        <button className={mode === "deposit" ? "desk-tab active" : "desk-tab"} onClick={() => setMode("deposit")}>
          DEPOSIT
        </button>
        <button className={mode === "withdraw" ? "desk-tab active" : "desk-tab"} onClick={() => setMode("withdraw")}>
          WITHDRAW
        </button>
      </div>

      <label className="trade-field">
        <span>Amount (USDG)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" />
        {mode === "deposit" && typeof usdgBalance === "bigint" && (
          <small>balance {formatUsdg(usdgBalance)} USDG</small>
        )}
      </label>

      {needsApproval ? (
        <button className="app-connect-button" disabled={approve.isPending || approveReceipt.isLoading} onClick={handleApprove}>
          {approve.isPending || approveReceipt.isLoading ? "Approving…" : "Approve USDG"}
        </button>
      ) : (
        <button
          className="app-connect-button"
          disabled={!account || !parsedAmount || action.isPending || actionReceipt.isLoading}
          onClick={handleAction}
        >
          {action.isPending || actionReceipt.isLoading
            ? mode === "deposit"
              ? "Depositing…"
              : "Withdrawing…"
            : mode === "deposit"
              ? "Deposit"
              : "Withdraw"}
        </button>
      )}

      {approve.error && <p className="error">{approve.error.message}</p>}
      {action.error && <p className="error">{action.error.message}</p>}
      {actionReceipt.isSuccess && action.data && (
        <p className="trade-success">
          Done — <CopyableAddress address={action.data} />
        </p>
      )}
    </div>
  );
}

export function EarnPanel() {
  const { isConnected } = useAccount();

  if (MORPHO_USDG_VAULTS.length === 0) {
    return (
      <div className="dash-list-card" style={{ padding: 24 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
          <strong style={{ color: "#f2f4f3" }}>Not configured on this deployment.</strong> Morpho&apos;s curated USDG
          vaults on Robinhood Chain are confirmed and real (see{" "}
          <code>src/lib/rwa/morpho-vaults.ts</code>) — this instance just doesn&apos;t have any vault addresses set
          yet.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return <div className="app-empty">Connect a wallet above to deposit into a vault.</div>;
  }

  return (
    <div className="earn-vault-grid">
      {MORPHO_USDG_VAULTS.map((vault) => (
        <VaultCard key={vault.address} vault={vault} />
      ))}
    </div>
  );
}
