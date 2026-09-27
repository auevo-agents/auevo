"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import { ConnectButton } from "../../connect-button";
import { robinhoodChain } from "@/lib/chains";
import { formatAge, shortenAddress } from "@/lib/format";
import { isWatched, readWatchedWallets, setWalletLabel, watchWallet } from "@/lib/watched-wallets";
import { computeWalletPnl } from "@/lib/wallet-pnl";
import { aggregatePositions, aggregatePositionsUsd, evaluatePosition, evaluatePositionUsd, type PositionView } from "@/lib/wallet-positions";
import { WETH9 } from "@/lib/uniswap";
import type { QuoteAssetPrice } from "@/lib/quote-asset";

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface PoolMeta {
  token0: string;
  token1: string;
  token0Symbol: string | null;
  token1Symbol: string | null;
}

interface SwapRow {
  pool_address: string;
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  tick: number;
  block_number: number;
  block_timestamp: string | null;
  age_seconds: number | null;
  tx_hash: string;
}

/**
 * A wallet's own profile — the thing "just a list of addresses" on the
 * old Wallets page was missing, the same gap DeBank's Follow feature and
 * Nansen's Wallet Profiler both fill for their own watchlists: a real
 * balance and a real activity feed once you click through, not just a
 * name in a list. The activity here comes from our own chain indexer
 * (see lib/indexer/), not a third party — see the note below the table
 * for exactly what window that does and doesn't cover.
 */
export default function WalletDetailPage(props: PageProps<"/app/wallets/[address]">) {
  const params = use(props.params);
  const raw = params.address;
  const address = isAddress(raw, { strict: false }) ? getAddress(raw) : null;

  const { address: connected } = useAccount();
  const [labelDraft, setLabelDraft] = useState("");
  const [editingLabel, setEditingLabel] = useState(false);
  const [watched, setWatchedState] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);

  const [activity, setActivity] = useState<{ swaps: SwapRow[]; pools: Record<string, PoolMeta>; indexed: boolean } | null>(
    null
  );
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWatchedState(isWatched(address));
    const entry = readWatchedWallets().find((w) => w.address.toLowerCase() === address.toLowerCase());
    setCurrentLabel(entry?.label ?? null);
  }, [address]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/wallets/${address}/activity`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setActivityError(data.error ?? "Could not load activity");
          return;
        }
        setActivity(data);
        setActivityError(null);
      } catch {
        if (!cancelled) setActivityError("Network error loading activity");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const balance = useBalance({
    address: address ?? undefined,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });

  const tokenAddresses = useMemo(() => {
    if (!activity) return [];
    const set = new Set<string>();
    for (const pool of Object.values(activity.pools)) {
      set.add(pool.token0.toLowerCase());
      set.add(pool.token1.toLowerCase());
    }
    return [...set];
  }, [activity]);

  // decimals() and balanceOf() for every token this wallet's indexed
  // activity touched — one multicall batch, not two, by interleaving
  // both calls per token rather than running a second useReadContracts.
  const tokenReads = useReadContracts({
    allowFailure: true,
    contracts: tokenAddresses.flatMap(
      (t) =>
        [
          { address: t as Address, abi: ERC20_ABI, functionName: "decimals" } as const,
          {
            address: t as Address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address ?? "0x0000000000000000000000000000000000000000"],
          } as const,
        ] as const
    ),
    query: { enabled: tokenAddresses.length > 0 && Boolean(address) },
  });

  const decimalsByToken = useMemo(() => {
    const map = new Map<string, number>();
    tokenAddresses.forEach((t, i) => {
      const result = tokenReads.data?.[i * 2]?.result;
      if (typeof result === "number") map.set(t, result);
    });
    return map;
  }, [tokenAddresses, tokenReads.data]);

  const balanceByToken = useMemo(() => {
    const map = new Map<string, bigint>();
    tokenAddresses.forEach((t, i) => {
      const result = tokenReads.data?.[i * 2 + 1]?.result;
      if (typeof result === "bigint") map.set(t, result);
    });
    return map;
  }, [tokenAddresses, tokenReads.data]);

  const symbolByToken = useMemo(() => {
    const map = new Map<string, string>();
    if (!activity) return map;
    for (const pool of Object.values(activity.pools)) {
      if (pool.token0Symbol) map.set(pool.token0.toLowerCase(), pool.token0Symbol);
      if (pool.token1Symbol) map.set(pool.token1.toLowerCase(), pool.token1Symbol);
    }
    return map;
  }, [activity]);

  const pnl = useMemo(() => {
    if (!activity) return null;
    const inputs = activity.swaps
      .map((s) => {
        const pool = activity.pools[s.pool_address];
        return pool ? { amount0: s.amount0, amount1: s.amount1, token0: pool.token0, token1: pool.token1 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return computeWalletPnl(inputs, WETH9);
  }, [activity]);

  const positionsByToken = useMemo(() => {
    if (!activity) return new Map();
    const inputs = activity.swaps
      .map((s) => {
        const pool = activity.pools[s.pool_address];
        return pool
          ? { amount0: s.amount0, amount1: s.amount1, token0: pool.token0, token1: pool.token1, tick: s.tick, blockNumber: s.block_number }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return aggregatePositions(inputs, WETH9, (t) => decimalsByToken.get(t.toLowerCase()) ?? 18);
  }, [activity, decimalsByToken]);

  const positionViews = useMemo(() => {
    const views: PositionView[] = [];
    for (const [token, pos] of positionsByToken) {
      const balanceRaw = balanceByToken.get(token);
      if (balanceRaw === undefined) continue;
      const decimals = decimalsByToken.get(token) ?? 18;
      views.push(evaluatePosition(pos, Number(formatUnits(balanceRaw, decimals))));
    }
    return views.sort((a, b) => b.currentValueWeth - a.currentValueWeth);
  }, [positionsByToken, balanceByToken, decimalsByToken]);

  const totalUnrealizedPnlWeth = useMemo(() => {
    const withData = positionViews.filter((p) => p.unrealizedPnlWeth !== null);
    if (withData.length === 0) return null;
    return withData.reduce((sum, p) => sum + (p.unrealizedPnlWeth ?? 0), 0);
  }, [positionViews]);

  // RWA_SPEC.md Phase 6's "/app/portfolio в USD" — a second, USD-denominated
  // view scoped to just this wallet's tokenized-stock holdings, alongside
  // (not replacing) the general ETH-denominated Positions section above.
  const [quoteAssets, setQuoteAssets] = useState<QuoteAssetPrice[] | null>(null);
  const [rwaTickerByAddress, setRwaTickerByAddress] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch("/api/rwa/quote-assets")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.assets)) setQuoteAssets(data.assets);
      })
      .catch(() => {});

    fetch("/api/rwa/assets")
      .then((res) => res.json())
      .then((data: { assets?: { ticker: string; tokens: { chainId: number; address: string }[] }[] }) => {
        const map = new Map<string, string>();
        for (const asset of data.assets ?? []) {
          for (const t of asset.tokens) {
            if (t.chainId === robinhoodChain.id) map.set(t.address.toLowerCase(), asset.ticker);
          }
        }
        setRwaTickerByAddress(map);
      })
      .catch(() => {});
  }, []);

  const positionsByTokenUsd = useMemo(() => {
    if (!activity || !quoteAssets) return new Map();
    const inputs = activity.swaps
      .map((s) => {
        const pool = activity.pools[s.pool_address];
        return pool
          ? { amount0: s.amount0, amount1: s.amount1, token0: pool.token0, token1: pool.token1, tick: s.tick, blockNumber: s.block_number }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return aggregatePositionsUsd(inputs, quoteAssets, (t) => decimalsByToken.get(t.toLowerCase()) ?? 18);
  }, [activity, quoteAssets, decimalsByToken]);

  interface RwaPositionRow {
    ticker: string;
    balance: number;
    avgCostUsd: number | null;
    currentPriceUsd: number;
    currentValueUsd: number;
    unrealizedPnlUsd: number | null;
  }

  const rwaPositionViews = useMemo(() => {
    const views: RwaPositionRow[] = [];
    for (const [token, pos] of positionsByTokenUsd) {
      const ticker = rwaTickerByAddress.get(token);
      if (!ticker) continue; // this section is scoped to verified RWA tokens only
      const balanceRaw = balanceByToken.get(token);
      if (balanceRaw === undefined) continue;
      const decimals = decimalsByToken.get(token) ?? 18;
      const view = evaluatePositionUsd(pos, Number(formatUnits(balanceRaw, decimals)));
      views.push({ ticker, ...view });
    }
    return views.sort((a, b) => b.currentValueUsd - a.currentValueUsd);
  }, [positionsByTokenUsd, balanceByToken, decimalsByToken, rwaTickerByAddress]);

  const totalPortfolioUsd = useMemo(() => rwaPositionViews.reduce((sum, v) => sum + v.currentValueUsd, 0), [rwaPositionViews]);

  if (!address) {
    return (
      <>
        <header className="product-header product-header--wallets">
          <div>
            <h3>Wallet</h3>
          </div>
        </header>
        <div className="app-empty">That&apos;s not a valid address.</div>
      </>
    );
  }

  return (
    <>
      <header className="product-header product-header--wallets">
        <div>
          <h3>Wallet</h3>
          <p>Balance and on-chain activity · Robinhood Chain</p>
        </div>
        <ConnectButton />
      </header>

      <Link href="/app/wallets" className="token-back">
        ← Back to Wallets
      </Link>

      <div className="token-detail-header">
        <div>
          {editingLabel ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder="Name this wallet…"
                autoFocus
              />
              <button
                className="app-link-button"
                onClick={() => {
                  setWalletLabel(address, labelDraft);
                  setCurrentLabel(labelDraft.trim() || null);
                  setEditingLabel(false);
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <h2>
              {currentLabel ?? shortenAddress(address, 8, 6)}
              {watched && (
                <button
                  className="app-link-button"
                  style={{ marginLeft: 10 }}
                  onClick={() => {
                    setLabelDraft(currentLabel ?? "");
                    setEditingLabel(true);
                  }}
                >
                  {currentLabel ? "rename" : "+ name"}
                </button>
              )}
            </h2>
          )}
          <code className="scan-mono">
            {address}
            {address.toLowerCase() === connected?.toLowerCase() && " (you)"}
          </code>
          <div className="token-detail-links">
            <a href={`https://robinhoodchain.blockscout.com/address/${address}`} target="_blank" rel="noreferrer">
              View on Blockscout
            </a>
          </div>
        </div>

        <div className="token-detail-price">
          <strong>
            {balance.data ? `${Number(formatUnits(balance.data.value, balance.data.decimals)).toFixed(4)} ETH` : "…"}
          </strong>
          {!watched && (
            <button
              className="app-connect-button"
              style={{ marginTop: 10 }}
              onClick={() => {
                watchWallet(address);
                setWatchedState(true);
              }}
            >
              + Follow
            </button>
          )}
        </div>
      </div>

      {activity && activity.indexed && pnl && (
        <div className="token-side-card" style={{ marginTop: 20 }}>
          <h4>Trading summary</h4>
          {pnl.tokensTraded === 0 ? (
            <p className="desk-note">No WETH-paired trades in the indexer&apos;s current window to summarize.</p>
          ) : (
            <div className="token-stat-grid">
              <div className="token-stat">
                <span>REALIZED PNL</span>
                <strong
                  className={
                    pnl.wins + pnl.losses === 0 ? "" : pnl.realizedPnlEth >= 0 ? "desk-change-pos" : "desk-change-neg"
                  }
                >
                  {pnl.wins + pnl.losses === 0
                    ? "—"
                    : `${pnl.realizedPnlEth >= 0 ? "+" : ""}${pnl.realizedPnlEth.toFixed(4)} ETH`}
                </strong>
              </div>
              <div className="token-stat">
                <span>WIN RATE</span>
                <strong>{pnl.wins + pnl.losses === 0 ? "—" : `${pnl.wins}/${pnl.wins + pnl.losses}`}</strong>
              </div>
              <div className="token-stat">
                <span>TOKENS TRADED</span>
                <strong>{pnl.tokensTraded}</strong>
              </div>
              <div className="token-stat">
                <span>UNREALIZED PNL</span>
                <strong className={totalUnrealizedPnlWeth === null ? "" : totalUnrealizedPnlWeth >= 0 ? "desk-change-pos" : "desk-change-neg"}>
                  {totalUnrealizedPnlWeth === null
                    ? "—"
                    : `${totalUnrealizedPnlWeth >= 0 ? "+" : ""}${totalUnrealizedPnlWeth.toFixed(4)} ETH`}
                </strong>
              </div>
            </div>
          )}
          <p className="desk-note" style={{ marginTop: 12 }}>
            Realized PnL and win rate only count a token where both a buy and a sell are visible in
            this window, priced in ETH from the exact WETH leg of each swap — not a USD
            approximation. Unrealized PnL marks whatever is still held against the pool&apos;s own
            last traded price (no third-party feed) and average cost from this wallet&apos;s own
            buys — a token moved in from outside this window will show a skewed cost basis. Same
            methodology as <Link href="/app/smart-money">Smart Money</Link>, applied to this one wallet.
          </p>
        </div>
      )}

      {rwaPositionViews.length > 0 && (
        <div className="token-side-card" style={{ marginTop: 20 }}>
          <h4>RWA Portfolio (USD)</h4>
          <p className="desk-note" style={{ marginBottom: 10 }}>
            Tokenized-stock holdings only, priced in USD from each trade&apos;s USDG or WETH leg (RWA_SPEC.md phase 6) — the general Positions
            section below covers every token this wallet has traded, in ETH.
          </p>
          <div className="token-stat-grid">
            <div className="token-stat">
              <span>TOTAL VALUE</span>
              <strong>{totalPortfolioUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</strong>
            </div>
          </div>
          <div className="desk-scroll" style={{ marginTop: 10 }}>
            <div className="money-row money-row-nopair money-head">
              <span>ASSET</span>
              <span className="desk-col-right">BALANCE</span>
              <span className="desk-col-right">VALUE</span>
              <span className="desk-col-right">UNREALIZED PNL</span>
            </div>
            {rwaPositionViews.map((v) => (
              <Link key={v.ticker} href={`/app/assets/${v.ticker}`} className="money-row money-row-nopair money-row-link">
                <span>
                  <b>{v.ticker}</b>
                </span>
                <span className="desk-col-right">{v.balance.toFixed(4)}</span>
                <span className="desk-col-right">
                  {v.currentValueUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
                </span>
                <span className={`desk-col-right ${v.unrealizedPnlUsd === null ? "" : v.unrealizedPnlUsd >= 0 ? "desk-change-pos" : "desk-change-neg"}`}>
                  {v.unrealizedPnlUsd === null
                    ? "—"
                    : `${v.unrealizedPnlUsd >= 0 ? "+" : ""}${v.unrealizedPnlUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tokenAddresses.length > 0 && (
        <div className="token-side-card" style={{ marginTop: 20 }}>
          <h4>Positions</h4>
          <p className="desk-note" style={{ marginBottom: 10 }}>
            Live balances for tokens seen in this wallet&apos;s recent activity — not every token it
            has ever held, only what this window surfaced. Avg cost and mark price only price
            against WETH-paired pools.
          </p>
          <PositionsList
            tokenAddresses={tokenAddresses}
            symbolByToken={symbolByToken}
            decimalsByToken={decimalsByToken}
            balanceByToken={balanceByToken}
            positionsByToken={positionsByToken}
          />
        </div>
      )}

      <div className="token-side-card" style={{ marginTop: 20 }}>
        <h4>Recent activity</h4>

        {activityError && <p className="error">{activityError}</p>}

        {!activity && !activityError && <div className="app-empty">Loading…</div>}

        {activity && !activity.indexed && (
          <p className="desk-note">
            The chain indexer isn&apos;t connected yet, so there&apos;s no activity feed to show here.
          </p>
        )}

        {activity && activity.indexed && activity.swaps.length === 0 && (
          <p className="desk-note">
            No swaps for this address in the indexer&apos;s current window (a rolling recent slice of
            chain history, not the full record yet — see Smart Money for details on why).
          </p>
        )}

        {activity && activity.swaps.length > 0 && (
          <>
            <div className="desk-scroll">
              <div className="wallet-activity-row wallet-activity-head">
                <span>TIME</span>
                <span>PAIR</span>
                <span>MOVED</span>
                <span>ROLE</span>
                <span />
              </div>
              {activity.swaps.map((s) => (
                <ActivityRow key={s.tx_hash} swap={s} pool={activity.pools[s.pool_address]} decimalsByToken={decimalsByToken} viewing={address} />
              ))}
            </div>
            <p className="desk-note">
              From our own indexer, not a third party — a rolling recent window of chain
              history (see Smart Money). &quot;Sender&quot; is often a router contract routing
              the trade, not a person; &quot;Recipient&quot; is who actually received the output.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function PositionsList({
  tokenAddresses,
  symbolByToken,
  decimalsByToken,
  balanceByToken,
  positionsByToken,
}: {
  tokenAddresses: string[];
  symbolByToken: Map<string, string>;
  decimalsByToken: Map<string, number>;
  balanceByToken: Map<string, bigint>;
  positionsByToken: ReturnType<typeof aggregatePositions>;
}) {
  const held = tokenAddresses
    .map((t) => {
      const balance = balanceByToken.get(t);
      if (balance === undefined || balance <= 0n) return null;
      const decimals = decimalsByToken.get(t) ?? 18;
      const balanceHuman = Number(formatUnits(balance, decimals));
      const pos = positionsByToken.get(t);
      const view = pos ? evaluatePosition(pos, balanceHuman) : null;
      return {
        address: t,
        symbol: symbolByToken.get(t) ?? shortenAddress(t, 4, 4),
        balanceHuman,
        view,
      };
    })
    .filter((h): h is NonNullable<typeof h> => h !== null)
    .sort((a, b) => (b.view?.currentValueWeth ?? 0) - (a.view?.currentValueWeth ?? 0));

  if (balanceByToken.size === 0) {
    return <p className="app-empty">Loading…</p>;
  }
  if (held.length === 0) {
    return <p className="desk-note">No non-zero balances among these tokens right now.</p>;
  }

  return (
    <div className="desk-scroll">
      <div className="position-row position-head">
        <span>TOKEN</span>
        <span>BALANCE</span>
        <span>AVG COST</span>
        <span>MARK PRICE</span>
        <span>UNREALIZED PNL</span>
      </div>
      {held.map((h) => (
        <div className="position-row" key={h.address}>
          <code className="scan-mono">{h.symbol}</code>
          <span>{h.balanceHuman.toFixed(4)}</span>
          <span>{h.view?.avgCostWeth !== null && h.view?.avgCostWeth !== undefined ? `${h.view.avgCostWeth.toFixed(6)} ETH` : "—"}</span>
          <span>{h.view ? `${h.view.currentPriceWeth.toFixed(6)} ETH` : "—"}</span>
          <span
            className={
              h.view?.unrealizedPnlWeth == null ? "" : h.view.unrealizedPnlWeth >= 0 ? "desk-change-pos" : "desk-change-neg"
            }
          >
            {h.view?.unrealizedPnlWeth == null
              ? "—"
              : `${h.view.unrealizedPnlWeth >= 0 ? "+" : ""}${h.view.unrealizedPnlWeth.toFixed(4)} ETH`}
          </span>
        </div>
      ))}
    </div>
  );
}

function ActivityRow({
  swap,
  pool,
  decimalsByToken,
  viewing,
}: {
  swap: SwapRow;
  pool: PoolMeta | undefined;
  decimalsByToken: Map<string, number>;
  viewing: string;
}) {
  const amount0 = BigInt(swap.amount0);
  const amount1 = BigInt(swap.amount1);
  const dec0 = pool ? decimalsByToken.get(pool.token0.toLowerCase()) ?? 18 : 18;
  const dec1 = pool ? decimalsByToken.get(pool.token1.toLowerCase()) ?? 18 : 18;

  const sym0 = pool?.token0Symbol ?? (pool ? shortenAddress(pool.token0, 4, 4) : "?");
  const sym1 = pool?.token1Symbol ?? (pool ? shortenAddress(pool.token1, 4, 4) : "?");

  // Uniswap V3 Swap amounts are from the pool's perspective: positive
  // means the pool received it (the trader paid it in), negative means
  // the pool paid it out (the trader received it).
  const paidLeg = amount0 > 0n ? { symbol: sym0, amount: amount0, decimals: dec0 } : { symbol: sym1, amount: amount1, decimals: dec1 };
  const receivedLeg = amount0 > 0n ? { symbol: sym1, amount: amount1, decimals: dec1 } : { symbol: sym0, amount: amount0, decimals: dec0 };

  const role = swap.recipient.toLowerCase() === viewing.toLowerCase() ? "Recipient" : "Sender";

  return (
    <div className="wallet-activity-row">
      <span>{formatAge(swap.age_seconds)} ago</span>
      <span>
        {sym0} / {sym1}
      </span>
      <span>
        <span className="desk-change-neg">-{Number(formatUnits(paidLeg.amount, paidLeg.decimals)).toFixed(4)} {paidLeg.symbol}</span>
        {" → "}
        <span className="desk-change-pos">
          +{Number(formatUnits(-receivedLeg.amount, receivedLeg.decimals)).toFixed(4)} {receivedLeg.symbol}
        </span>
      </span>
      <span>{role}</span>
      <span className="desk-actions">
        <a href={`https://robinhoodchain.blockscout.com/tx/${swap.tx_hash}`} target="_blank" rel="noreferrer">
          tx
        </a>
      </span>
    </div>
  );
}
