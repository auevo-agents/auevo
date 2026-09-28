"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "./private-swap.module.css";

type Token = {
  id: string;
  symbol: string;
  name: string;
  icon?: string;
  chainData?: { name?: string; shortName?: string };
  price?: number;
};
type Quote = {
  quoteId: string;
  type: "private";
  amountIn: number;
  amountOut: number;
  amountOutUsd?: number;
  duration: number;
  min?: number;
  max?: number;
  swapName?: string;
};
type Order = {
  houdiniId: string;
  created?: string;
  expires?: string;
  depositAddress: string;
  depositTag?: string;
  receiverAddress: string;
  status: number;
  statusLabel?: string;
  inAmount: number;
  inSymbol: string;
  outAmount: number;
  outSymbol: string;
  eta?: number;
  swapName?: string;
  transactionHash?: string;
  hashUrl?: string;
};

const API = "/api/rwa/private-swap/houdini";
const terminalStatuses = new Set([4, 5, 6, 7, 8]);

const GATE_ACKNOWLEDGEMENTS = [
  "I am not a U.S. resident or citizen, and I am not located in a country subject to U.S. or EU sanctions.",
  "I am at least 18 years old.",
  "The funds I use are not connected to unlawful activity.",
  "The destination address is a wallet I control, and I have checked the address.",
  "I understand that routing times vary and a transfer may take 15–45 minutes; provider partners may review, hold, or refund it.",
  "I will send the exact amount shown before the deposit expires.",
] as const;

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
  return data as T;
}

function formatNumber(value: number | undefined, maximumFractionDigits = 8) {
  if (value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(Number(value));
}

function houdiniHeaders(json = false): HeadersInit {
  let timezone = "";
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* use provider default */ }
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(timezone ? { "x-user-timezone": timezone } : {}),
  };
}

function safeExplorerUrl(url: string | undefined) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function PrivateSwapClient() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [search, setSearch] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [addressTo, setAddressTo] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [gateChecks, setGateChecks] = useState<boolean[]>(() => GATE_ACKNOWLEDGEMENTS.map(() => false));
  const [gateContinued, setGateContinued] = useState(false);

  const selectedFrom = useMemo(() => tokens.find((token) => token.id === fromId), [tokens, fromId]);
  const selectedTo = useMemo(() => tokens.find((token) => token.id === toId), [tokens, toId]);
  const isTerminal = order ? terminalStatuses.has(order.status) : false;

  const loadTokens = useCallback(async (term: string) => {
    setLoadingTokens(true);
    setError("");
    try {
      const params = new URLSearchParams({ term });
      const data = await readJson<{ tokens?: Token[] }>(await fetch(`${API}/tokens?${params.toString()}`, { cache: "no-store", headers: houdiniHeaders() }));
      const nextTokens = Array.isArray(data.tokens) ? data.tokens.filter((token) => token?.id && token?.symbol) : [];
      setTokens((current) => {
        const merged = [...nextTokens];
        for (const token of current) if (!merged.some((item) => item.id === token.id)) merged.push(token);
        return merged;
      });
      setFromId((current) => current || nextTokens[0]?.id || "");
      setToId((current) => current || nextTokens.find((token) => token.id !== fromId)?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Houdini assets.");
    } finally {
      setLoadingTokens(false);
    }
  }, []);

  useEffect(() => { if (gateContinued) void loadTokens(""); }, [loadTokens, gateContinued]);

  useEffect(() => {
    if (!search.trim()) return;
    const timer = window.setTimeout(() => { void loadTokens(search.trim()); }, 350);
    return () => window.clearTimeout(timer);
  }, [search, loadTokens]);

  useEffect(() => {
    if (!order || terminalStatuses.has(order.status)) return;
    let active = true;
    const poll = async () => {
      try {
        const params = new URLSearchParams({ id: order.houdiniId });
        const data = await readJson<{ order: Order }>(await fetch(`${API}/orders?${params.toString()}`, { cache: "no-store", headers: houdiniHeaders() }));
        if (active && data.order) setOrder(data.order);
      } catch {
        // Keep the last known order visible; a transient status outage must not hide deposit instructions.
      }
    };
    const timer = window.setInterval(poll, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [order?.houdiniId, order?.status]);

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOrder(null);
    setQuote(null);
    setConfirmed(false);
    if (!fromId || !toId || fromId === toId || !amount || Number(amount) <= 0) {
      setError("Choose two different assets and enter an amount.");
      return;
    }
    setQuoting(true);
    try {
      const data = await readJson<{ quote: Quote }>(await fetch(`${API}/quotes`, {
        method: "POST",
        headers: houdiniHeaders(true),
        body: JSON.stringify({ amount, from: fromId, to: toId }),
      }));
      setQuote(data.quote);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No private quote is available.");
    } finally {
      setQuoting(false);
    }
  }

  async function createOrder() {
    if (!quote || !addressTo.trim() || !confirmed) return;
    setCreating(true);
    setError("");
    try {
      const data = await readJson<{ order: Order }>(await fetch(`${API}/orders`, {
        method: "POST",
        headers: houdiniHeaders(true),
        body: JSON.stringify({ quoteId: quote.quoteId, addressTo: addressTo.trim() }),
      }));
      setOrder(data.order);
      setQuote(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a Houdini order.");
    } finally {
      setCreating(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the address manually.");
    }
  }

  const canContinue = gateChecks.every(Boolean);

  if (!gateContinued) {
    return (
      <div className={styles.gateBackdrop}>
        <section className={styles.gateDialog} role="dialog" aria-modal="true" aria-labelledby="private-gate-title">
          <div className={styles.gateTopline}>
            <span className={styles.gateBrand}><i /> AUEVO <b>PRIVATE</b></span>
            <span className={styles.gateStep}>BEFORE YOU CONTINUE</span>
          </div>
          <div className={styles.gateWarning}>
            <span className={styles.gateWarningIcon} aria-hidden="true">!</span>
            <p>
              Private swaps route through third-party exchange partners and may take 15–45 minutes.
              Partners may screen a transfer, request a review, hold it, or refund it. This route does
              not guarantee anonymity. Send only the exact quoted amount to the deposit address before
              it expires; transfers sent to the wrong address or network may not be recoverable.
            </p>
          </div>
          <div className={styles.gateChecklist}>
            <h2 id="private-gate-title">Please confirm before using Private Swap</h2>
            <div className={styles.gateItems}>
              {GATE_ACKNOWLEDGEMENTS.map((label, index) => (
                <label className={styles.gateItem} key={label}>
                  <input
                    type="checkbox"
                    checked={gateChecks[index]}
                    onChange={(event) => setGateChecks((current) => current.map((checked, item) => item === index ? event.target.checked : checked))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <button className={styles.gateContinue} type="button" disabled={!canContinue} onClick={() => setGateContinued(true)}>
              Continue
            </button>
            <p className={styles.gateFootnote}>Auevo does not custody funds or control provider execution.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.intro}>
        <div className={styles.eyebrow}><span /> PRIVATE ROUTING · POWERED BY HOUDINI</div>
        <h1>Move beyond the obvious route.</h1>
        <p>Request a private multi-hop swap, review the route, then send the exact deposit amount from your wallet.</p>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}

      {!order ? (
        <div className={styles.layout}>
          <section className={styles.card} aria-label="Private swap form">
            <div className={styles.cardHeader}>
              <div><span className={styles.kicker}>01 / CONFIGURE</span><h2>Build your route</h2></div>
              <span className={styles.live}><i /> PRIVATE</span>
            </div>
            <form onSubmit={requestQuote}>
              <label className={styles.fieldLabel} htmlFor="houdini-search">Find an asset</label>
              <input
                id="houdini-search"
                className={styles.input}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search symbol or asset name"
                autoComplete="off"
              />
              <div className={styles.assetGrid}>
                <label className={styles.field}>
                  <span>From</span>
                  <select value={fromId} onChange={(event) => setFromId(event.target.value)} disabled={loadingTokens}>
                    {tokens.map((token) => <option key={token.id} value={token.id}>{token.symbol} · {token.chainData?.shortName ?? token.chainData?.name ?? token.name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>To</span>
                  <select value={toId} onChange={(event) => setToId(event.target.value)} disabled={loadingTokens}>
                    {tokens.filter((token) => token.id !== fromId).map((token) => <option key={token.id} value={token.id}>{token.symbol} · {token.chainData?.shortName ?? token.chainData?.name ?? token.name}</option>)}
                  </select>
                </label>
              </div>
              <label className={styles.field}>
                <span>Amount</span>
                <div className={styles.amountBox}>
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    required
                  />
                  <b>{selectedFrom?.symbol ?? "TOKEN"}</b>
                </div>
              </label>
              <label className={styles.field}>
                <span>Receive address</span>
                <input
                  value={addressTo}
                  onChange={(event) => setAddressTo(event.target.value)}
                  placeholder="Your destination wallet address"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </label>
              <button className={styles.primary} type="submit" disabled={loadingTokens || quoting || !tokens.length || !selectedFrom || !selectedTo}>
                {loadingTokens ? "Loading assets…" : quoting ? "Finding a private route…" : "Get private quote"}
              </button>
            </form>
            {quote && (
              <div className={styles.quote}>
                <div className={styles.quoteTop}><span>PRIVATE ROUTE FOUND</span><b>{quote.duration ? `~${quote.duration} min` : "ETA varies"}</b></div>
                <div className={styles.quoteAmounts}>
                  <div><small>You send</small><strong>{formatNumber(quote.amountIn)} {selectedFrom?.symbol}</strong></div>
                  <span>→</span>
                  <div><small>Estimated receive</small><strong>{formatNumber(quote.amountOut)} {selectedTo?.symbol}</strong></div>
                </div>
                {quote.min != null || quote.max != null ? <p className={styles.range}>Available range: {quote.min != null ? formatNumber(quote.min) : "—"} – {quote.max != null ? formatNumber(quote.max) : "—"} {selectedFrom?.symbol}</p> : null}
                <p className={styles.disclaimer}>Quote can change before the order is created. Review the deposit instructions before sending funds.</p>
                <label className={styles.confirm}>
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  <span>I understand this creates a Houdini order and the deposit must be sent manually.</span>
                </label>
                <button className={styles.secondary} type="button" onClick={createOrder} disabled={!confirmed || !addressTo.trim() || creating}>
                  {creating ? "Creating order…" : "Create deposit instructions"}
                </button>
              </div>
            )}
          </section>

          <aside className={styles.aside}>
            <div className={styles.routeCard}>
              <span className={styles.kicker}>HOW PRIVATE ROUTING WORKS</span>
              <div className={styles.routeLine}>
                <div><i>01</i><b>Your wallet</b><small>Start with your asset</small></div>
                <span />
                <div><i>02</i><b>Houdini route</b><small>Multi-hop exchange flow</small></div>
                <span />
                <div><i>03</i><b>Destination</b><small>Receive at your address</small></div>
              </div>
            </div>
            <div className={styles.noticeCard}>
              <div className={styles.noticeIcon}>A</div>
              <div><b>Review every detail</b><p>After creating an order, send only the exact amount shown to its deposit address. Include the memo or tag when one is provided.</p></div>
            </div>
            <div className={styles.facts}>
              <span><i /> Private routes can take around 15–45 minutes.</span>
              <span><i /> Availability depends on asset, chain and amount.</span>
              <span><i /> Auevo never asks for your seed phrase.</span>
          <span><i /> Houdini may process IP and device signals for fraud checks; routing is not a guarantee of anonymity.</span>
            </div>
          </aside>
        </div>
      ) : (
        <section className={styles.orderCard}>
          <div className={styles.cardHeader}>
            <div><span className={styles.kicker}>02 / YOUR ORDER</span><h2>{isTerminal ? (order.statusLabel ?? "Order updated") : "Deposit instructions"}</h2></div>
            <span className={isTerminal ? styles.orderState : styles.live}><i /> {order.statusLabel ?? (isTerminal ? "COMPLETE" : "WAITING FOR DEPOSIT")}</span>
          </div>
          <div className={styles.orderSummary}>
            <div><small>Send exactly</small><strong>{formatNumber(order.inAmount)} {order.inSymbol}</strong></div>
            <div><small>Estimated receive</small><strong>{formatNumber(order.outAmount)} {order.outSymbol}</strong></div>
            <div><small>Order reference</small><strong className={styles.reference}>{order.houdiniId}</strong></div>
          </div>
          <div className={styles.depositBlock}>
            <div><small>Deposit address</small><button onClick={() => void copy(order.depositAddress, "address")} type="button">{copied === "address" ? "Copied" : "Copy address"}</button></div>
            <code>{order.depositAddress}</code>
          </div>
          {order.depositTag ? <div className={styles.depositBlock}><div><small>Memo / tag · required</small><button onClick={() => void copy(order.depositTag!, "tag")} type="button">{copied === "tag" ? "Copied" : "Copy tag"}</button></div><code>{order.depositTag}</code></div> : null}
          <div className={styles.receiver}><small>Destination wallet</small><code>{order.receiverAddress}</code></div>
          <div className={styles.orderNotice}>
            <b>{isTerminal ? "Status refreshes automatically" : "Send the deposit from your wallet"}</b>
            <p>{isTerminal ? "This order is in a final state. Check the current provider status above." : "Use the exact amount and address above. Sending a different amount, omitting a required tag, or sending after expiry can delay recovery. Do not send from an exchange account if its withdrawal rules could remove required information."}</p>
          </div>
          {order.transactionHash && <div className={styles.hashRow}><span>Transaction</span>{safeExplorerUrl(order.hashUrl) ? <a href={safeExplorerUrl(order.hashUrl)} target="_blank" rel="noreferrer">{order.transactionHash}</a> : <code>{order.transactionHash}</code>}</div>}
          <div className={styles.orderFooter}>
            <span>ETA from provider: {order.eta ? `about ${order.eta} min` : "varies by route"}</span>
            <button className={styles.textButton} type="button" onClick={() => { setOrder(null); setQuote(null); setError(""); }}>Start another swap</button>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <span className={styles.footerMark}>A</span>
        <p>Houdini provides the private routing service. Auevo does not custody funds or control provider execution. Confirm the chain, amount, tag and destination before sending.</p>
      </footer>
    </main>
  );
}
