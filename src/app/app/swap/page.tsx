"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { robinhoodChain } from "@/lib/chains";
import { LIFI_EVM_CHAIN_LIST, chainNameFor } from "@/lib/rwa/lifi/chains";
import { ConnectButton } from "../connect-button";
import { executeRoute, LIFI_NATIVE_ADDRESS, type StepLog } from "./route-executor";
import type { Route, RoutesResponse } from "@lifi/types";

/**
 * RWA_SPEC.md section 6's /app/swap: "Swap (одна сеть) / Bridge
 * (кросс-чейн), сравнение маршрутов Best Return / Fastest, трекинг
 * статуса." Both tabs call the same /api/lifi/routes proxy — Swap just
 * pins toChainId to fromChainId, since LI.FI treats a same-chain request
 * as ordinary DEX aggregation rather than needing a separate endpoint
 * (confirmed by reading @lifi/sdk's own getRoutes.js — one function, one
 * path, for both cases).
 *
 * Robinhood Chain's v3/v4-direct path (swap-panel.tsx, /app/trading) is
 * NOT replaced by this page — that path is faster and cheaper for a plain
 * Robinhood-Chain-only trade. This page is for moving value across any of
 * the six chains in rwa/lifi/chains.ts, Robinhood Chain included as
 * either endpoint.
 *
 * Token inputs are plain addresses (no per-chain token-list/search UI in
 * this phase — see this file's git history / RWA_SPEC.md phase 5 for
 * where a real picker would belong). The "native" checkbox fills in the
 * zero address, the standard EVM-aggregator sentinel for "this chain's
 * gas token, not an ERC-20" (see route-executor.ts's LIFI_NATIVE_ADDRESS
 * doc comment for why this couldn't be verified against LI.FI's live docs
 * from this sandbox, and why that's an acceptable, fail-closed risk).
 */

type Mode = "swap" | "bridge";

function isValidToken(value: string): value is Address {
  return value === LIFI_NATIVE_ADDRESS || isAddress(value, { strict: false });
}

function routeLabel(route: Route): string {
  if (route.tags?.includes("RECOMMENDED")) return "Best Return";
  if (route.tags?.includes("FASTEST")) return "Fastest";
  if (route.tags?.includes("CHEAPEST")) return "Cheapest";
  if (route.tags?.includes("SAFEST")) return "Safest";
  return "Route";
}

function totalDurationSeconds(route: Route): number {
  return route.steps.reduce((sum, step) => sum + (step.estimate?.executionDuration ?? 0), 0);
}

const PHASE_LABEL: Record<StepLog["phase"], string> = {
  waiting: "Waiting",
  "switching-chain": "Switching network…",
  approving: "Approving token…",
  building: "Preparing transaction…",
  sending: "Confirm in wallet…",
  confirming: "Confirming on-chain…",
  bridging: "Bridging…",
  done: "Done",
  failed: "Failed",
};

export default function SwapBridgePage() {
  return (
    <Suspense fallback={null}>
      <SwapBridgeApp />
    </Suspense>
  );
}

function SwapBridgeApp() {
  const { address: account, isConnected } = useAccount();
  const searchParams = useSearchParams();

  // Prefills from the asset-detail page's per-row "bridge" link
  // (?mode=bridge&toChain=4663&toToken=0x…) — see app/assets/[ticker]/page.tsx.
  // Read once via useState initializers, not an effect: this is the
  // page's own starting state, not a value that should keep re-syncing
  // to the URL after the user starts editing it.
  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "bridge" ? "bridge" : "swap");
  const [fromChainId, setFromChainId] = useState<number>(LIFI_EVM_CHAIN_LIST[1].id); // base — a sensible non-Robinhood default
  const [toChainId, setToChainId] = useState<number>(() => {
    const fromQuery = Number(searchParams.get("toChain"));
    return LIFI_EVM_CHAIN_LIST.some((c) => c.id === fromQuery) ? fromQuery : LIFI_EVM_CHAIN_LIST[5].id; // robinhoodChain
  });
  const [fromToken, setFromToken] = useState("");
  const [toToken, setToToken] = useState(() => searchParams.get("toToken") ?? "");
  const [fromNative, setFromNative] = useState(false);
  const [toNative, setToNative] = useState(false);
  const [amount, setAmount] = useState("");

  const [routesResponse, setRoutesResponse] = useState<RoutesResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [executing, setExecuting] = useState(false);
  const [stepLogs, setStepLogs] = useState<StepLog[] | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // null = not checked yet, true/false = whether LI.FI's own /v1/chains
  // actually lists Robinhood Chain as live — see api/lifi/chains/route.ts's
  // doc comment on why this can only ever be confirmed against the real
  // LI.FI API, never from this dev environment.
  const [robinhoodLifiSupport, setRobinhoodLifiSupport] = useState<boolean | null>(null);

  const effectiveToChainId = mode === "swap" ? fromChainId : toChainId;
  const effectiveFromToken = fromNative ? LIFI_NATIVE_ADDRESS : fromToken;
  const effectiveToToken = toNative ? LIFI_NATIVE_ADDRESS : toToken;
  const fromTokenAddr = isValidToken(effectiveFromToken) ? effectiveFromToken : undefined;
  const toTokenAddr = isValidToken(effectiveToToken) ? effectiveToToken : undefined;

  const fromMeta = useReadContracts({
    allowFailure: true,
    contracts: [
      fromTokenAddr && !fromNative
        ? { address: fromTokenAddr, abi: ERC20_ABI, functionName: "decimals", chainId: fromChainId }
        : undefined,
      fromTokenAddr && !fromNative
        ? { address: fromTokenAddr, abi: ERC20_ABI, functionName: "symbol", chainId: fromChainId }
        : undefined,
      fromTokenAddr && !fromNative && account
        ? { address: fromTokenAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [account], chainId: fromChainId }
        : undefined,
    ].filter(Boolean) as never[],
    query: { enabled: Boolean(fromTokenAddr && !fromNative) },
  });
  const [fromDecimals, fromSymbol, fromBalance] = useMemo(() => fromMeta.data?.map((r) => r.result) ?? [], [fromMeta.data]);
  const effectiveFromDecimals = fromNative ? 18 : (fromDecimals as number | undefined);

  const parsedAmount = useMemo(() => {
    if (!amount || typeof effectiveFromDecimals !== "number") return null;
    try {
      return parseUnits(amount, effectiveFromDecimals);
    } catch {
      return null;
    }
  }, [amount, effectiveFromDecimals]);

  // Route search, auto-refreshed ~60s per RWA_SPEC.md's own cadence.
  useEffect(() => {
    let cancelled = false;

    async function fetchRoutes() {
      setRoutesResponse(null);
      setQuoteError(null);
      setSelectedRouteId(null);
      setRobinhoodLifiSupport(null);
      // account is optional here — LI.FI quotes a route from token/chain/amount
      // alone; a wallet is only needed to actually send anything, checked at
      // the "Swap"/"Bridge" button below.
      if (!fromTokenAddr || !toTokenAddr || !parsedAmount || parsedAmount <= 0n) return;
      if (mode === "swap" && fromTokenAddr.toLowerCase() === toTokenAddr.toLowerCase()) {
        setQuoteError("Choose two different tokens");
        return;
      }

      setQuoting(true);
      try {
        const res = await fetch("/api/lifi/routes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fromChainId,
            fromAmount: parsedAmount.toString(),
            fromTokenAddress: fromTokenAddr,
            fromAddress: account,
            toChainId: effectiveToChainId,
            toTokenAddress: toTokenAddr,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setQuoteError(data.error ?? "Could not find a route");
          return;
        }
        setRoutesResponse(data);
        if (data.routes?.length) setSelectedRouteId(data.routes[0].id);
      } catch {
        if (!cancelled) setQuoteError("Network error reaching the route proxy");
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }

    const timer = setTimeout(fetchRoutes, 500);
    const interval = setInterval(fetchRoutes, 60_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fromChainId, effectiveToChainId, fromTokenAddr, toTokenAddr, parsedAmount, account, mode]);

  const involvesRobinhood = fromChainId === robinhoodChain.id || effectiveToChainId === robinhoodChain.id;
  const gotEmptyRoutes = Boolean(routesResponse && routesResponse.routes.length === 0 && !quoting);

  useEffect(() => {
    if (!gotEmptyRoutes || !involvesRobinhood || robinhoodLifiSupport !== null) return;
    let cancelled = false;
    fetch("/api/lifi/chains")
      .then((res) => res.json())
      .then((data: { chains?: { id: number }[] }) => {
        if (cancelled) return;
        setRobinhoodLifiSupport(Boolean(data.chains?.some((c) => c.id === robinhoodChain.id)));
      })
      .catch(() => {
        // Couldn't confirm either way — stays null, empty-state text below falls back to the generic message.
      });
    return () => {
      cancelled = true;
    };
  }, [gotEmptyRoutes, involvesRobinhood, robinhoodLifiSupport]);

  const selectedRoute = routesResponse?.routes.find((r) => r.id === selectedRouteId) ?? null;

  async function handleExecute() {
    if (!selectedRoute || !account) return;
    setExecuting(true);
    setExecuteError(null);
    setStepLogs(null);
    try {
      await executeRoute({ route: selectedRoute, account, onUpdate: setStepLogs });
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : "The route failed partway through — see the step log above");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <>
      <header className="product-header">
        <div>
          <h3>Swap / Bridge</h3>
          <p>Cross-chain via LI.FI · {LIFI_EVM_CHAIN_LIST.map((c) => c.name).join(" · ")}</p>
        </div>
        <ConnectButton />
      </header>

      <div className="desk-tabs">
        <button className={mode === "swap" ? "desk-tab active" : "desk-tab"} onClick={() => setMode("swap")}>
          Swap
        </button>
        <button className={mode === "bridge" ? "desk-tab active" : "desk-tab"} onClick={() => setMode("bridge")}>
          Bridge
        </button>
      </div>

      <div className="trade-form" style={{ maxWidth: 480 }}>
        {!isConnected && (
          <div className="app-notice app-notice-info">
            Browsing and getting quotes works without a wallet — connect above only when you&apos;re ready to actually swap or bridge.
          </div>
        )}

        <label className="trade-field">
            <span>From chain</span>
            <select value={fromChainId} onChange={(e) => setFromChainId(Number(e.target.value))}>
              {LIFI_EVM_CHAIN_LIST.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="trade-field">
            <span>From token</span>
            <input
              value={fromNative ? "" : fromToken}
              onChange={(e) => setFromToken(e.target.value.trim())}
              placeholder="0x… token address"
              spellCheck={false}
              disabled={fromNative}
            />
            <small>
              <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <input type="checkbox" checked={fromNative} onChange={(e) => setFromNative(e.target.checked)} />
                native {chainNameFor(fromChainId)} gas token
              </label>
              {typeof fromSymbol === "string" && ` · ${fromSymbol}`}
              {typeof fromBalance === "bigint" && typeof effectiveFromDecimals === "number"
                ? ` · balance ${Number(formatUnits(fromBalance, effectiveFromDecimals)).toFixed(4)}`
                : ""}
            </small>
          </label>

          {mode === "bridge" && (
            <label className="trade-field">
              <span>To chain</span>
              <select value={toChainId} onChange={(e) => setToChainId(Number(e.target.value))}>
                {LIFI_EVM_CHAIN_LIST.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="trade-field">
            <span>To token</span>
            <input
              value={toNative ? "" : toToken}
              onChange={(e) => setToToken(e.target.value.trim())}
              placeholder="0x… token address"
              spellCheck={false}
              disabled={toNative}
            />
            <small>
              <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <input type="checkbox" checked={toNative} onChange={(e) => setToNative(e.target.checked)} />
                native {chainNameFor(effectiveToChainId)} gas token
              </label>
            </small>
          </label>

          <label className="trade-field">
            <span>Amount</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" />
          </label>

          <div className="trade-quote">
            {quoting && <span>Finding routes…</span>}
            {quoteError && <span className="trade-quote-error">{quoteError}</span>}
          </div>

          {routesResponse && routesResponse.routes.length > 0 && (
            <div className="desk-scroll" style={{ marginTop: 8 }}>
              {routesResponse.routes.map((route) => {
                const outDecimals = route.toToken.decimals;
                return (
                  <label
                    key={route.id}
                    className="money-row money-row-nopair"
                    style={{ cursor: "pointer", border: route.id === selectedRouteId ? "1px solid var(--red)" : undefined }}
                  >
                    <span>
                      <input
                        type="radio"
                        name="route"
                        checked={route.id === selectedRouteId}
                        onChange={() => setSelectedRouteId(route.id)}
                        style={{ marginRight: 8 }}
                      />
                      {routeLabel(route)}
                    </span>
                    <span className="desk-col-right">
                      {Number(formatUnits(BigInt(route.toAmount), outDecimals)).toFixed(6)} {route.toToken.symbol}
                    </span>
                    <span className="desk-col-right">~{Math.round(totalDurationSeconds(route) / 60)} min</span>
                    <span className="desk-col-right">{route.steps.map((s) => s.tool).join(" + ")}</span>
                  </label>
                );
              })}
            </div>
          )}

          {routesResponse && routesResponse.routes.length === 0 && !quoting && (
            <p className="app-empty">
              {involvesRobinhood && robinhoodLifiSupport === false
                ? "LI.FI doesn't have Robinhood Chain in its live routing yet — this specific pair can't bridge until it does."
                : "No route found for this pair/amount."}
            </p>
          )}

          <button className="app-connect-button" disabled={!selectedRoute || !account || executing} onClick={handleExecute}>
            {executing ? "Executing…" : !account ? "Connect wallet to continue" : mode === "swap" ? "Swap" : "Bridge"}
          </button>

          {executeError && <p className="error">{executeError}</p>}

          {stepLogs && (
            <div className="desk-scroll" style={{ marginTop: 12 }}>
              <div className="money-row money-row-nopair money-head">
                <span>STEP</span>
                <span>CHAINS</span>
                <span className="desk-col-right">STATUS</span>
                <span />
              </div>
              {stepLogs.map((log) => (
                <div key={log.index} className="money-row money-row-nopair">
                  <span>{log.label}</span>
                  <span>
                    {chainNameFor(log.chainId)}
                    {log.chainId !== log.toChainId ? ` → ${chainNameFor(log.toChainId)}` : ""}
                  </span>
                  <span className={`desk-col-right ${log.phase === "failed" ? "desk-change-neg" : log.phase === "done" ? "desk-change-pos" : ""}`}>
                    {PHASE_LABEL[log.phase]}
                  </span>
                  <span className="desk-actions">
                    {log.explorerUrl ? (
                      <a href={log.explorerUrl} target="_blank" rel="noreferrer">
                        tx
                      </a>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
    </>
  );
}
