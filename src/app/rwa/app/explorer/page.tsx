"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { chainNameFor, explorerTxUrl } from "@/lib/rwa/lifi/chains";
import { CopyableAddress } from "@/app/copyable-address";
import { CopyButton } from "@/app/copy-button";

/**
 * RWA_SPEC.md section 6's /app/explorer — "наши транзакции": every swap
 * (Phase 2, Robinhood Chain v3/v4) and bridge (Phase 4, LI.FI) this app
 * itself has sent through, read back from app_transfers via
 * /api/rwa/transfers. Shows the connected wallet's own rows when a wallet
 * is connected, else the most recent rows across everyone — same "works
 * without a wallet, better with one" posture as the rest of /app.
 */

interface Transfer {
  id: number;
  account: string;
  recipient: string;
  chainId: number;
  toChainId: number | null;
  srcToken: string;
  dstToken: string;
  amountIn: string;
  amountOut: string | null;
  route: string;
  bridgeTool: string | null;
  feeBps: number;
  txHash: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CLASS: Record<string, string> = {
  pending: "desk-badge-neutral",
  done: "desk-badge-pos",
  partial: "desk-badge-neutral",
  refunded: "desk-badge-neutral",
  failed: "desk-badge-neg",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ExplorerPage() {
  const { address: account } = useAccount();
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = onlyMine && account ? `/api/rwa/transfers?account=${account}` : "/api/rwa/transfers";
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load transfers");
          return;
        }
        setTransfers(data.transfers);
      } catch {
        if (!cancelled) setError("Network error loading transfers");
      }
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [account, onlyMine]);

  return (
    <>
      <header className="product-header product-header--explorer">
        <div>
          <h3>Explorer</h3>
          <p>Every swap and bridge Auevo has sent through — Robinhood Chain trades (Phase 2) and LI.FI transfers (Phase 4)</p>
        </div>
        {account && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#7c8589" }}>
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Only my wallet
          </label>
        )}
      </header>

      {error && <p className="error">{error}</p>}
      {!error && !transfers && <div className="app-empty">Loading…</div>}
      {!error && transfers?.length === 0 && <div className="app-empty">No transfers recorded yet.</div>}

      {transfers && transfers.length > 0 && (
        <div className="desk-scroll">
          <div className="money-row money-row-nopair money-head">
            <span>WHEN</span>
            <span>ROUTE</span>
            <span className="desk-col-right">AMOUNT IN</span>
            <span className="desk-col-right">STATUS</span>
            <span />
          </div>
          {transfers.map((t) => {
            const crossChain = t.toChainId !== null && t.toChainId !== t.chainId;
            const explorerUrl = t.txHash ? explorerTxUrl(t.chainId, t.txHash) : null;
            return (
              <div key={t.id} className="money-row money-row-nopair">
                <span>
                  {formatTime(t.createdAt)}
                  <br />
                  <small style={{ color: "#5a6469" }}>
                    <CopyableAddress address={t.account} />
                  </small>
                </span>
                <span>
                  <CopyableAddress address={t.srcToken} /> → <CopyableAddress address={t.dstToken} />
                  <br />
                  <small style={{ color: "#5a6469" }}>
                    {crossChain
                      ? `${chainNameFor(t.chainId)} → ${chainNameFor(t.toChainId!)} · ${t.bridgeTool ?? t.route}`
                      : `${chainNameFor(t.chainId)} · ${t.route}`}
                  </small>
                </span>
                <span className="desk-col-right">{t.amountIn}</span>
                <span className="desk-col-right">
                  <span className={STATUS_CLASS[t.status] ?? "desk-badge-neutral"}>{t.status}</span>
                </span>
                <span className="desk-actions">
                  {explorerUrl ? (
                    <>
                      <a href={explorerUrl} target="_blank" rel="noreferrer">
                        tx
                      </a>
                      {t.txHash && <CopyButton value={t.txHash} title="Copy tx hash" />}
                    </>
                  ) : (
                    <span style={{ color: "#5a6469" }}>—</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
