"use client";

import { useState } from "react";
import type { ScanResult } from "@/lib/scan";

type Status = "idle" | "loading" | "error" | "done";

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function handleScan() {
    if (!wallet.trim()) return;
    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: wallet.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setStatus("error");
        return;
      }
      setResult(data as ScanResult);
      setStatus("done");
    } catch {
      setError("Network error — try again");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-center mb-3">
          How much have you paid trading bots?
        </h1>
        <p className="text-neutral-400 text-center mb-10">
          Paste any Solana wallet address. We scan the last 90 days of public
          transaction history and add up every fee sent to known trading bots
          — Axiom, BullX, Trojan, BonkBot, and more. No wallet connection, no
          risk, nothing to sign.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
            placeholder="Enter Solana wallet address"
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm outline-none focus:border-neutral-600"
          />
          <button
            onClick={handleScan}
            disabled={status === "loading"}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-semibold rounded-lg px-6 py-3 text-sm transition"
          >
            {status === "loading" ? "Scanning…" : "Check my fees"}
          </button>
        </div>

        {status === "error" && (
          <p className="text-red-400 text-sm text-center mb-6">{error}</p>
        )}

        {status === "done" && result && <ResultCard result={result} />}
      </div>
    </main>
  );
}

function ResultCard({ result }: { result: ScanResult }) {
  if (result.totalTxScanned === 0) {
    return (
      <p className="text-neutral-400 text-center mt-6">
        No transactions found for this wallet in the last {result.daysScanned}{" "}
        days.
      </p>
    );
  }

  if (result.breakdown.length === 0) {
    return (
      <p className="text-neutral-400 text-center mt-6">
        No fees to known bots found in {result.totalTxScanned} scanned
        transactions over the last {result.daysScanned} days. (Note: Axiom,
        BullX, Photon and GMGN aren&apos;t detectable yet — see below.)
      </p>
    );
  }

  return (
    <div className="mt-8 border border-neutral-800 rounded-xl p-6 bg-neutral-900/50">
      <p className="text-neutral-400 text-sm mb-1 text-center">
        Over the last {result.daysScanned} days you paid trading bots
      </p>
      <p className="text-5xl font-bold text-center mb-6">
        ${result.totalUsd.toFixed(0)}
      </p>

      <div className="space-y-2 mb-6">
        {result.breakdown.map((b) => (
          <div
            key={b.botKey}
            className="flex justify-between text-sm border-b border-neutral-800 pb-2"
          >
            <span className="text-neutral-300">
              {b.name}{" "}
              <span className="text-neutral-500">
                · {b.txCount} trade{b.txCount === 1 ? "" : "s"}
              </span>
            </span>
            <span className="font-medium">${b.usdPaid.toFixed(0)}</span>
          </div>
        ))}
      </div>

      <p className="text-neutral-500 text-xs text-center">
        {result.totalBotTrades} trades detected · {result.totalTxScanned} total
        transactions scanned · SOL @ ${result.solPriceUsd.toFixed(0)}
      </p>
      <p className="text-neutral-600 text-xs text-center mt-3">
        {result.unsupportedBots.join(", ")} aren&apos;t counted yet — they don&apos;t
        use a fixed fee wallet, support coming soon.
      </p>
    </div>
  );
}
