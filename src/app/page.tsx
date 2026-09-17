"use client";

import { useState } from "react";
import type { ScanResult } from "@/lib/scan";

type Status = "idle" | "loading" | "error" | "done";

const today = () =>
  new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

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
    <main className="min-h-screen flex flex-col items-center px-6 py-20">
      <div className="w-full max-w-[420px]">
        <header className="text-center mb-10">
          <p className="text-xs tracking-wide text-ink-faint mb-3">auevo.io</p>
          <h1 className="text-2xl leading-snug">
            what did the bots
            <br />
            take from you?
          </h1>
          <p className="text-sm text-ink-faint mt-4 leading-relaxed">
            Paste a Solana wallet. We scan 90 days of public history and print
            every fee it paid Axiom, BullX, Trojan, BonkBot and the rest.
            Nothing to connect, nothing to sign.
          </p>
        </header>

        <div className="mb-10">
          <input
            type="text"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
            placeholder="wallet address"
            className="w-full bg-receipt border border-line px-4 py-3 text-sm outline-none focus:border-ink placeholder:text-ink-faint mb-3"
          />
          <button
            onClick={handleScan}
            disabled={status === "loading"}
            className="w-full bg-stamp disabled:opacity-50 text-receipt py-3 text-sm tracking-wide"
          >
            {status === "loading" ? "printing…" : "print my receipt"}
          </button>
        </div>

        {status === "error" && (
          <p className="text-stamp text-sm text-center mb-6">{error}</p>
        )}

        {status === "done" && result && <Receipt result={result} />}
        {status === "done" && result && result.breakdown.length > 0 && (
          <EmailCapture wallet={result.wallet} totalUsd={result.totalUsd} />
        )}
      </div>
    </main>
  );
}

function EmailCapture({ wallet, totalUsd }: { wallet: string; totalUsd: number }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit() {
    if (!email.trim()) return;
    setState("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), wallet, totalUsd }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-ink-faint text-center mt-6">
        got it — we&apos;ll let you know when there&apos;s a way to stop paying this.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <p className="text-sm text-ink-faint text-center mb-3">
        want to know when there&apos;s a way to stop paying this?
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="you@example.com"
          className="flex-1 bg-receipt border border-line px-3 py-2 text-sm outline-none focus:border-ink placeholder:text-ink-faint"
        />
        <button
          onClick={submit}
          disabled={state === "sending"}
          className="bg-ink disabled:opacity-50 text-receipt px-4 text-sm"
        >
          {state === "sending" ? "…" : "notify me"}
        </button>
      </div>
      {state === "error" && (
        <p className="text-stamp text-xs text-center mt-2">
          couldn&apos;t save that — try again
        </p>
      )}
    </div>
  );
}

function Receipt({ result }: { result: ScanResult }) {
  const empty = result.totalTxScanned === 0;
  const noFees = !empty && result.breakdown.length === 0;

  return (
    <div className="torn-edge receipt-print bg-receipt px-6 pt-7 pb-8 shadow-[0_2px_0_var(--line)]">
      <div className="text-center mb-5">
        <p className="text-sm tracking-widest">A U E V O</p>
        <p className="text-[11px] text-ink-faint mt-1">
          fee receipt · last {result.daysScanned} days
        </p>
        <p className="text-[11px] text-ink-faint">{today()}</p>
      </div>

      <div className="border-t border-dashed border-line mb-4" />

      {empty && (
        <p className="text-sm text-ink-faint text-center py-4">
          no transactions found for this wallet
        </p>
      )}

      {noFees && (
        <p className="text-sm text-ink-faint text-center py-4 leading-relaxed">
          no fees to known bots in {result.totalTxScanned} transactions.
          <br />
          axiom &amp; bullx not covered yet.
        </p>
      )}

      {!empty && !noFees && (
        <>
          <div className="space-y-2 mb-4">
            {result.breakdown.map((b) => (
              <div key={b.botKey} className="flex items-baseline text-sm">
                <span>
                  {b.name.toLowerCase()}{" "}
                  <span className="text-ink-faint">
                    x{b.txCount}
                  </span>
                </span>
                <span className="leader" />
                <span>${b.usdPaid.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-line mb-4" />

          <div className="flex items-baseline text-base font-semibold mb-1">
            <span>total</span>
            <span className="leader" />
            <span className="text-stamp">${result.totalUsd.toFixed(2)}</span>
          </div>
          <p className="text-[11px] text-ink-faint text-right mb-5">
            {result.totalSol.toFixed(3)} SOL
          </p>

          <div className="border-t border-dashed border-line mb-4" />

          <p className="text-[11px] text-ink-faint leading-relaxed">
            {result.totalBotTrades} bot trades · {result.totalTxScanned} tx
            scanned
            <br />
            sol @ ${result.solPriceUsd.toFixed(2)}
            <br />
            axiom · bullx not counted yet
          </p>
        </>
      )}

      <p className="text-center text-[11px] text-ink-faint mt-6">
        · · · thank you for trading · · ·
      </p>
    </div>
  );
}
