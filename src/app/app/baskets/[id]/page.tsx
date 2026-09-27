"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatUnits, parseUnits, maxUint256, type Address } from "viem";
import { useAccount, useReadContracts, useSendTransaction, useSignTypedData, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { PERMIT2, USDG, USDG_DECIMALS } from "@/lib/rwa/dex/addresses";
import { Disclaimer } from "../../../disclaimer";

/**
 * RWA_SPEC.md Phase 7's basket buy/sell page — the "покупка корзины ...
 * одной подписью" done-bar. Buy always has one input (USDG), so at most
 * one Permit2 signature; sell can need one signature per distinct held
 * token that hasn't been Permit2-approved to UniversalRouter before (see
 * lib/rwa/dex/basket.ts's own doc comment) — the on-chain transaction
 * itself is still exactly one signature either way. This mirrors
 * swap-panel.tsx's own approve-Permit2 / sign-Permit2 / send flow, applied
 * per leg instead of to a single pair.
 */

interface Holding {
  ticker: string;
  targetWeight: number;
  token: Address | null;
  symbol: string | null;
  decimals: number | null;
  priceUsd: number | null;
  available: boolean;
}

interface BasketDetail {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  holdings: Holding[];
}

type WeightMode = "target" | "equal" | "custom";

interface SignedPermit {
  details: { token: Address; amount: string; expiration: number; nonce: number };
  spender: Address;
  sigDeadline: number;
  signature: `0x${string}`;
}

interface PermitTypedData {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Omit<SignedPermit, "signature">;
}

interface RebalanceLegView {
  ticker: string;
  token: Address;
  side: "buy" | "sell";
  amountIn: string;
  protocol: string;
}

interface RebalancePreview {
  needed: boolean;
  driftBps: Record<string, number>;
  driftThresholdBps: number;
  to?: Address;
  data?: `0x${string}`;
  value?: string;
  legs?: RebalanceLegView[];
  excluded: { ticker: string; reason: string }[];
}

async function fetchPermit(owner: Address, token: Address): Promise<PermitTypedData | null> {
  const res = await fetch(`/api/dex/permit-typed-data?owner=${owner}&token=${token}`);
  const data = await res.json();
  if (!res.ok) return null;
  return data;
}

export default function BasketDetailPage({ params }: PageProps<"/app/baskets/[id]">) {
  const { id } = use(params);
  const { address: account, isConnected } = useAccount();

  const [basket, setBasket] = useState<BasketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rwa/baskets/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setBasket(data);
      })
      .catch(() => {
        if (!cancelled) setError("Network error loading this basket");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const availableHoldings = useMemo(() => basket?.holdings.filter((h) => h.available) ?? [], [basket]);
  const tokens = useMemo(() => availableHoldings.map((h) => h.token!).filter(Boolean), [availableHoldings]);

  // Wallet's own balance + Permit2 allowance for USDG (the buy input) and
  // for every held basket token (the sell inputs) — one batched read,
  // same shape as swap-panel.tsx's tokenMeta.
  const reads = useReadContracts({
    allowFailure: true,
    contracts: [
      account && { address: USDG, abi: ERC20_ABI, functionName: "balanceOf", args: [account] },
      account && { address: USDG, abi: ERC20_ABI, functionName: "allowance", args: [account, PERMIT2] },
      ...tokens.flatMap((token) => [
        account && { address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account] },
        account && { address: token, abi: ERC20_ABI, functionName: "allowance", args: [account, PERMIT2] },
      ]),
    ].filter(Boolean) as never[],
    query: { enabled: Boolean(account && basket) },
  });
  const readResults = reads.data?.map((r) => r.result) ?? [];
  const usdgBalance = readResults[0] as bigint | undefined;
  const usdgAllowanceToPermit2 = readResults[1] as bigint | undefined;
  const tokenBalances = new Map<Address, bigint>();
  const tokenAllowances = new Map<Address, bigint>();
  tokens.forEach((token, i) => {
    tokenBalances.set(token, readResults[2 + i * 2] as bigint | undefined as bigint);
    tokenAllowances.set(token, readResults[3 + i * 2] as bigint | undefined as bigint);
  });

  // --- Buy ---
  const [weightMode, setWeightMode] = useState<WeightMode>("target");
  const [customWeights, setCustomWeights] = useState<Record<string, number>>({});
  const [amountIn, setAmountIn] = useState("");
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buyPreview, setBuyPreview] = useState<{ ticker: string; amountIn: string }[] | null>(null);
  const [buyExcluded, setBuyExcluded] = useState<{ ticker: string; reason: string }[]>([]);

  const approveUsdc = useWriteContract();
  const signPermit = useSignTypedData();
  const [pendingPermit, setPendingPermit] = useState<Omit<SignedPermit, "signature"> | null>(null);
  const [usdgPermit, setUsdgPermit] = useState<SignedPermit | null>(null);
  const sendBuyTx = useSendTransaction();
  const buyReceipt = useWaitForTransactionReceipt({ hash: sendBuyTx.data });

  useEffect(() => {
    if (signPermit.data && pendingPermit) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setUsdgPermit({ ...pendingPermit, signature: signPermit.data });
      setPendingPermit(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [signPermit.data, pendingPermit]);

  const parsedAmountIn = useMemo(() => {
    if (!amountIn) return null;
    try {
      return parseUnits(amountIn, USDG_DECIMALS);
    } catch {
      return null;
    }
  }, [amountIn]);

  const needsUsdgApprove = typeof usdgAllowanceToPermit2 === "bigint" && parsedAmountIn !== null ? usdgAllowanceToPermit2 < parsedAmountIn : false;

  async function handleApproveUsdg() {
    approveUsdc.writeContract({ address: USDG, abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] });
  }

  async function handleSignUsdgPermit() {
    if (!account) return;
    const data = await fetchPermit(account, USDG);
    if (!data) return;
    setPendingPermit(data.message);
    signPermit.signTypedData({
      domain: data.domain,
      types: data.types as Record<string, { name: string; type: string }[]>,
      primaryType: data.primaryType,
      message: data.message as unknown as Record<string, unknown>,
    });
  }

  async function handleBuy() {
    if (!account || !parsedAmountIn || !basket) return;
    setBuyError(null);
    setBuyPreview(null);
    try {
      const res = await fetch(`/api/rwa/baskets/${basket.id}/build-buy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountIn: parsedAmountIn.toString(),
          recipient: account,
          weightMode,
          customWeights: weightMode === "custom" ? customWeights : undefined,
          permit: usdgPermit ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuyError(data.error ?? "Could not build the basket buy");
        return;
      }
      setBuyPreview(data.legs.map((l: { ticker: string; amountIn: string }) => ({ ticker: l.ticker, amountIn: l.amountIn })));
      setBuyExcluded(data.excluded ?? []);
      sendBuyTx.sendTransaction({ to: data.to, data: data.data, value: BigInt(data.value) });
    } catch {
      setBuyError("Network error building the basket buy");
    }
  }

  // --- Sell ---
  const [sellPermits, setSellPermits] = useState<Record<string, SignedPermit>>({});
  const [sellPendingToken, setSellPendingToken] = useState<Address | null>(null);
  const sellApprove = useWriteContract();
  const sellSignPermit = useSignTypedData();
  const [pendingSellPermit, setPendingSellPermit] = useState<{ ticker: string; permit: Omit<SignedPermit, "signature"> } | null>(null);
  const sendSellTx = useSendTransaction();
  const sellReceipt = useWaitForTransactionReceipt({ hash: sendSellTx.data });
  const [sellError, setSellError] = useState<string | null>(null);

  useEffect(() => {
    if (sellSignPermit.data && pendingSellPermit) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setSellPermits((prev) => ({
        ...prev,
        [pendingSellPermit.ticker]: { ...pendingSellPermit.permit, signature: sellSignPermit.data! },
      }));
      setPendingSellPermit(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [sellSignPermit.data, pendingSellPermit]);

  async function handleSignSellPermit(ticker: string, token: Address) {
    if (!account) return;
    const data = await fetchPermit(account, token);
    if (!data) return;
    setPendingSellPermit({ ticker, permit: data.message });
    sellSignPermit.signTypedData({
      domain: data.domain,
      types: data.types as Record<string, { name: string; type: string }[]>,
      primaryType: data.primaryType,
      message: data.message as unknown as Record<string, unknown>,
    });
  }

  async function handleSell(fraction: number) {
    if (!account || !basket) return;
    setSellError(null);
    const holdings = availableHoldings
      .filter((h) => h.token && (tokenBalances.get(h.token) ?? 0n) > 0n)
      .map((h) => {
        const balance = tokenBalances.get(h.token!)!;
        const amountIn = (balance * BigInt(Math.round(fraction * 1000))) / 1000n;
        return { ticker: h.ticker, amountIn: amountIn.toString(), permit: sellPermits[h.ticker] };
      })
      .filter((h) => BigInt(h.amountIn) > 0n);

    if (holdings.length === 0) {
      setSellError("No basket holdings in this wallet to sell");
      return;
    }

    try {
      const res = await fetch(`/api/rwa/baskets/${basket.id}/build-sell`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdings, recipient: account }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSellError(data.error ?? "Could not build the basket sell");
        return;
      }
      sendSellTx.sendTransaction({ to: data.to, data: data.data, value: BigInt(data.value) });
    } catch {
      setSellError("Network error building the basket sell");
    }
  }

  // --- Automated rebalancing (non-custodial — see lib/rwa/baskets.ts's resolveBasketRebalance doc comment) ---
  const [rebalancePreview, setRebalancePreview] = useState<RebalancePreview | null>(null);
  const [rebalanceChecking, setRebalanceChecking] = useState(false);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);
  const [rebalancePermits, setRebalancePermits] = useState<Record<string, SignedPermit>>({});
  const [rebalancePendingToken, setRebalancePendingToken] = useState<Address | null>(null);
  const rebalanceApprove = useWriteContract();
  const rebalanceSignPermit = useSignTypedData();
  const [pendingRebalancePermit, setPendingRebalancePermit] = useState<{ token: Address; permit: Omit<SignedPermit, "signature"> } | null>(null);
  const sendRebalanceTx = useSendTransaction();
  const rebalanceReceipt = useWaitForTransactionReceipt({ hash: sendRebalanceTx.data });

  useEffect(() => {
    if (rebalanceSignPermit.data && pendingRebalancePermit) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setRebalancePermits((prev) => ({
        ...prev,
        [pendingRebalancePermit.token]: { ...pendingRebalancePermit.permit, signature: rebalanceSignPermit.data! },
      }));
      setPendingRebalancePermit(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [rebalanceSignPermit.data, pendingRebalancePermit]);

  const rebalanceRequiredTokens = useMemo(() => {
    const legs = rebalancePreview?.legs ?? [];
    const byToken = new Map<Address, { ticker: string; amountIn: bigint }>();
    for (const leg of legs) {
      const token = leg.side === "buy" ? USDG : leg.token;
      const prev = byToken.get(token);
      const amountIn = BigInt(leg.amountIn) + (prev?.amountIn ?? 0n);
      byToken.set(token, { ticker: leg.side === "buy" ? "USDG" : leg.ticker, amountIn });
    }
    return [...byToken.entries()].map(([token, v]) => ({ token, ...v }));
  }, [rebalancePreview]);

  async function checkRebalance() {
    if (!account || !basket) return;
    setRebalanceChecking(true);
    setRebalanceError(null);
    try {
      const holdingsBody = basket.holdings
        .filter((h) => h.token)
        .map((h) => ({ ticker: h.ticker, balance: (tokenBalances.get(h.token!) ?? 0n).toString() }));
      const res = await fetch(`/api/rwa/baskets/${basket.id}/build-rebalance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdings: holdingsBody, recipient: account, permits: rebalancePermits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRebalanceError(data.error ?? "Could not check rebalance");
        return;
      }
      setRebalancePreview(data);
    } catch {
      setRebalanceError("Network error checking rebalance");
    } finally {
      setRebalanceChecking(false);
    }
  }

  function handleApproveRebalanceToken(token: Address) {
    setRebalancePendingToken(token);
    rebalanceApprove.writeContract({ address: token, abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] });
  }

  async function handleSignRebalancePermit(token: Address) {
    if (!account) return;
    const data = await fetchPermit(account, token);
    if (!data) return;
    setPendingRebalancePermit({ token, permit: data.message });
    rebalanceSignPermit.signTypedData({
      domain: data.domain,
      types: data.types as Record<string, { name: string; type: string }[]>,
      primaryType: data.primaryType,
      message: data.message as unknown as Record<string, unknown>,
    });
  }

  function handleExecuteRebalance() {
    if (!rebalancePreview?.to || !rebalancePreview.data) return;
    sendRebalanceTx.sendTransaction({ to: rebalancePreview.to, data: rebalancePreview.data, value: BigInt(rebalancePreview.value ?? "0") });
  }

  if (error) return <div className="app-empty">{error}</div>;
  if (!basket) return <div className="app-empty">Loading…</div>;

  return (
    <>
      <header className="product-header">
        <div>
          <h3>{basket.name}</h3>
          <p>{basket.description}</p>
        </div>
        <Link href="/app/baskets" className="desk-tab">
          ← all baskets
        </Link>
      </header>

      <div className="desk-scroll">
        <div className="money-row money-row-nopair money-head">
          <span>TICKER</span>
          <span className="desk-col-right">WEIGHT</span>
          <span className="desk-col-right">PRICE</span>
          <span className="desk-col-right">STATUS</span>
        </div>
        {basket.holdings.map((h) => (
          <div key={h.ticker} className="money-row money-row-nopair">
            <span>
              <b>{h.ticker}</b>
              {h.symbol && <small style={{ color: "#5a6469" }}> {h.symbol}</small>}
            </span>
            <span className="desk-col-right">{(h.targetWeight * 100).toFixed(1)}%</span>
            <span className="desk-col-right">{h.priceUsd !== null ? `$${h.priceUsd.toFixed(2)}` : "—"}</span>
            <span className={`desk-col-right ${h.available ? "desk-change-pos" : "desk-change-neg"}`}>
              {h.available ? "listed" : "not verified here"}
            </span>
          </div>
        ))}
      </div>

      {!isConnected && <div className="app-empty">Connect a wallet above to trade this basket.</div>}

      {isConnected && (
        <div className="trade-panel trade-panel-wide">
        <div className="trade-form">
          <h4>Buy</h4>
          <div className="desk-tabs">
            <button className={weightMode === "target" ? "desk-tab active" : "desk-tab"} onClick={() => setWeightMode("target")}>
              TARGET
            </button>
            <button className={weightMode === "equal" ? "desk-tab active" : "desk-tab"} onClick={() => setWeightMode("equal")}>
              EQUAL
            </button>
            <button className={weightMode === "custom" ? "desk-tab active" : "desk-tab"} onClick={() => setWeightMode("custom")}>
              CUSTOM
            </button>
          </div>

          {weightMode === "custom" && (
            <div className="desk-scroll">
              {basket.holdings.map((h) => (
                <div key={h.ticker} className="money-row money-row-nopair">
                  <span>{h.ticker}</span>
                  <input
                    type="number"
                    min={0}
                    value={customWeights[h.ticker] ?? h.targetWeight}
                    onChange={(e) => setCustomWeights((prev) => ({ ...prev, [h.ticker]: Number(e.target.value) }))}
                  />
                </div>
              ))}
              <p className="desk-note">Values are relative shares, not required to sum to 1 — normalized automatically.</p>
            </div>
          )}

          <label>
            Amount to spend (USDG)
            <input type="text" inputMode="decimal" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} placeholder="0.0" />
          </label>
          {typeof usdgBalance === "bigint" && <p className="desk-note">Balance: {formatUnits(usdgBalance, USDG_DECIMALS)} USDG</p>}

          {needsUsdgApprove && (
            <button className="app-connect-button" onClick={handleApproveUsdg} disabled={approveUsdc.isPending}>
              {approveUsdc.isPending ? "Approving…" : "1. Approve USDG to Permit2"}
            </button>
          )}
          {!needsUsdgApprove && !usdgPermit && (
            <button className="app-connect-button" onClick={handleSignUsdgPermit} disabled={signPermit.isPending}>
              {signPermit.isPending ? "Signing…" : "2. Sign Permit2 (free, off-chain)"}
            </button>
          )}
          {!needsUsdgApprove && usdgPermit && (
            <button className="app-connect-button" onClick={handleBuy} disabled={!parsedAmountIn || sendBuyTx.isPending}>
              {sendBuyTx.isPending ? "Confirm in wallet…" : "3. Buy basket (one signature)"}
            </button>
          )}

          {buyError && <p className="error">{buyError}</p>}
          {buyPreview && (
            <div className="desk-note">
              <p>Legs: {buyPreview.map((l) => `${l.ticker} (${l.amountIn} USDG)`).join(", ")}</p>
              {buyExcluded.length > 0 && (
                <p>Excluded: {buyExcluded.map((e) => `${e.ticker} — ${e.reason}`).join(", ")}</p>
              )}
            </div>
          )}
          {buyReceipt.isSuccess && <p className="desk-change-pos">Basket bought.</p>}

          <h4>Sell</h4>
          <p className="desk-note">Sells whatever fraction of each held basket token this wallet actually holds, in one transaction.</p>
          {tokens.map((token) => {
            const allowance = tokenAllowances.get(token);
            const holding = availableHoldings.find((h) => h.token === token);
            const balance = tokenBalances.get(token);
            if (!holding || !balance || balance === 0n) return null;
            const needsApprove = typeof allowance === "bigint" ? allowance < balance : true;
            const hasPermit = Boolean(sellPermits[holding.ticker]);
            if (needsApprove) {
              return (
                <button
                  key={token}
                  onClick={() => {
                    setSellPendingToken(token);
                    sellApprove.writeContract({ address: token, abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] });
                  }}
                  disabled={sellApprove.isPending && sellPendingToken === token}
                >
                  Approve {holding.symbol ?? holding.ticker} to Permit2
                </button>
              );
            }
            if (!hasPermit) {
              return (
                <button key={token} onClick={() => handleSignSellPermit(holding.ticker, token)}>
                  Sign Permit2 for {holding.symbol ?? holding.ticker}
                </button>
              );
            }
            return null;
          })}
          <div className="desk-tabs">
            <button className="desk-tab" onClick={() => handleSell(0.25)}>SELL 25%</button>
            <button className="desk-tab" onClick={() => handleSell(0.5)}>SELL 50%</button>
            <button className="desk-tab" onClick={() => handleSell(1)}>SELL 100%</button>
          </div>
          {sellError && <p className="error">{sellError}</p>}
          {sellReceipt.isSuccess && <p className="desk-change-pos">Basket holdings sold.</p>}

          <h4>Automated rebalancing</h4>
          <p className="desk-note">
            Checks this wallet&apos;s actual holdings against this basket&apos;s target weights and, if they&apos;ve drifted
            more than 3%, prepares the exact trade to correct it — still one signature, and your funds never leave
            your own wallet in the meantime. Nothing trades automatically without you signing this transaction.
          </p>
          <button onClick={checkRebalance} disabled={rebalanceChecking}>
            {rebalanceChecking ? "Checking…" : "Check rebalance"}
          </button>
          {rebalanceError && <p className="error">{rebalanceError}</p>}

          {rebalancePreview && !rebalancePreview.needed && (
            <p className="desk-note">
              Within {(rebalancePreview.driftThresholdBps / 100).toFixed(0)}% of target weights — no rebalance needed
              right now.
            </p>
          )}

          {rebalancePreview?.needed && rebalancePreview.legs && (
            <>
              <div className="desk-scroll">
                {rebalancePreview.legs.map((l) => (
                  <div key={`${l.ticker}-${l.side}`} className="money-row money-row-nopair">
                    <span>
                      <b className={l.side === "sell" ? "desk-change-neg" : "desk-change-pos"}>{l.side.toUpperCase()}</b>{" "}
                      {l.ticker}
                    </span>
                    <span className="desk-col-right">
                      drift {((rebalancePreview.driftBps[l.ticker] ?? 0) / 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>

              {rebalanceRequiredTokens.map(({ token, ticker, amountIn }) => {
                const allowance = token === USDG ? usdgAllowanceToPermit2 : tokenAllowances.get(token);
                const needsApprove = typeof allowance === "bigint" ? allowance < amountIn : true;
                const hasPermit = Boolean(rebalancePermits[token]);
                if (needsApprove) {
                  return (
                    <button
                      key={token}
                      onClick={() => handleApproveRebalanceToken(token)}
                      disabled={rebalanceApprove.isPending && rebalancePendingToken === token}
                    >
                      Approve {ticker} to Permit2
                    </button>
                  );
                }
                if (!hasPermit) {
                  return (
                    <button key={token} onClick={() => handleSignRebalancePermit(token)}>
                      Sign Permit2 for {ticker}
                    </button>
                  );
                }
                return null;
              })}

              <button className="app-connect-button" onClick={handleExecuteRebalance} disabled={sendRebalanceTx.isPending}>
                {sendRebalanceTx.isPending ? "Confirm in wallet…" : "Execute rebalance"}
              </button>
              {rebalancePreview.excluded.length > 0 && (
                <p className="desk-note">
                  Excluded: {rebalancePreview.excluded.map((e) => `${e.ticker} — ${e.reason}`).join(", ")}
                </p>
              )}
            </>
          )}
          {rebalanceReceipt.isSuccess && <p className="desk-change-pos">Rebalanced.</p>}
        </div>
        </div>
      )}

      <Disclaimer compact />
    </>
  );
}
