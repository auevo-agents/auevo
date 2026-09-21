"use client";

import { useState } from "react";
import type { Trade } from "@/lib/geckoterminal";
import { formatAge, formatPrice, formatUsdCompact, shortenAddress } from "@/lib/format";
import { watchWallet } from "@/lib/watched-wallets";

/**
 * A list of real trades — shared by Smart Money (large trades across many
 * pools, so the pair matters per row) and the token detail page's own
 * trade feed (one pool, so the pair is already in the page header and
 * repeating it on every row would just be noise).
 */

export function TradeList({ trades, showPair }: { trades: Trade[]; showPair: boolean }) {
  const [watchedNow, setWatchedNow] = useState<string[]>([]);
  const rowClass = showPair ? "money-row" : "money-row money-row-nopair";

  return (
    <div className="desk-scroll">
      <div className={`${rowClass} money-head`}>
        <span>TIME</span>
        <span>SIDE</span>
        {showPair && <span>PAIR</span>}
        <span className="desk-col-right">SIZE</span>
        <span className="desk-col-right">PRICE</span>
        <span>TRADER</span>
        <span />
      </div>

      {trades.map((trade) => (
        <TradeRow
          key={trade.txHash ?? `${trade.poolAddress}-${trade.blockTimestamp}`}
          trade={trade}
          showPair={showPair}
          rowClass={rowClass}
          watched={watchedNow.includes(trade.traderAddress ?? "")}
          onWatch={() => {
            if (!trade.traderAddress) return;
            watchWallet(trade.traderAddress);
            setWatchedNow((prev) => [...prev, trade.traderAddress as string]);
          }}
        />
      ))}
    </div>
  );
}

function TradeRow({
  trade,
  showPair,
  rowClass,
  watched,
  onWatch,
}: {
  trade: Trade;
  showPair: boolean;
  rowClass: string;
  watched: boolean;
  onWatch: () => void;
}) {
  const sideClass =
    trade.kind === "buy" ? "desk-change-pos" : trade.kind === "sell" ? "desk-change-neg" : "desk-change-flat";

  return (
    <div className={rowClass}>
      <span className="desk-col-right" style={{ justifySelf: "start" }}>
        {formatAge(trade.ageSeconds)} ago
      </span>
      <span className={sideClass} style={{ fontWeight: 500 }}>
        {trade.kind ? trade.kind.toUpperCase() : "—"}
      </span>
      {showPair && (
        <span>
          {trade.baseToken.symbol ?? "?"} / {trade.quoteToken.symbol ?? "?"}
        </span>
      )}
      <span className="desk-col-right" style={{ fontWeight: 500 }}>
        {formatUsdCompact(trade.volumeUsd)}
      </span>
      <span className="desk-col-right">{formatPrice(trade.priceUsd)}</span>
      <span>
        {trade.traderAddress ? (
          <code className="scan-mono">{shortenAddress(trade.traderAddress)}</code>
        ) : (
          "—"
        )}
      </span>
      <span className="desk-actions">
        {trade.traderAddress && (
          <button className="app-link-button" onClick={onWatch} disabled={watched}>
            {watched ? "watching" : "+ watch"}
          </button>
        )}
        {trade.txHash && (
          <a
            href={`https://robinhoodchain.blockscout.com/tx/${trade.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            tx
          </a>
        )}
      </span>
    </div>
  );
}
