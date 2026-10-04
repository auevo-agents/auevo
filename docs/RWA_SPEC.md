# Auevo RWA — Rebuild Spec

> For Claude Code. Read this file in full before starting work. Work phase by phase; at the end of each one — build, tests, a short report, and a commit to branch `rwa/<phase>`.
> Before writing any code, read `AGENTS.md`: this is Next.js 16, the API differs from what you're used to — check against `node_modules/next/dist/docs/`.

## 1. Goal

Rebuild Auevo from a memecoin terminal into a **marketplace + scanner for tokenized real-world assets (RWA)**: stocks, ETFs, gold, treasuries, private credit.

Two layers:

1. **Storefront (like hyperdex.app)** — a catalog of all RWA tokens from every issuer and chain, an asset page, swap/bridge, baskets, pools, lending rates, issuers, an explorer, a portfolio.
2. **Scanner (what HyperDex doesn't have — our edge)** — premium/discount to the real stock price, arbitrage between issuers, risk scoring of issuer contracts, liquidity depth, smart money on stocks, new listings, alerts.

Starting chain — **Robinhood Chain (4663)**, then multichain via an aggregator.

## 2. Reference: how HyperDex is built (researched 2026-09-26)

- **Swap & Bridge:** everything through a proxy to LI.FI (`/api/lifi/v1/chains`, `/api/lifi/v1/tokens?chains=...`). 68 chains. Routes: Relay, Across, Kyberswap, Jupiter, DFlow, Nordstern Finance. Routes are labeled "Best Return" / "Fastest", quotes refresh roughly once a minute. Fee is 0.50% taken from the input token.
- **Assets:** 226 assets, 12 issuers. Categories: Stocks 179, ETFs 34, Commodities 7, Private Credit 3, Treasuries 3. Blocks: Most Traded (24h vol), Top Assets (mkt cap), Most Available (issuers × chains). A table with issuer/category filters, pagination.
- **Asset page** (`/assets/NVDA`): price, 1W/1M/3M/1Y chart, an "issuer · chain" selector, a swap card (USDG → NVDA on Robinhood Chain), onchain mkt cap, 24h vol, a list of all tokens for that ticker (bStocks/BNB, Coinbase/Base, Ondo/ETH/HyperEVM/Solana, Robinhood/Robinhood Chain, xStocks/BNB/ETH/HyperEVM/Solana), issuer descriptions, a disclaimer.
- **Issuer suffixes:** Ondo `NVDAon`, xStocks `NVDAx`, Robinhood — just `NVDA` (Robinhood Chain), Coinbase `NVDAc` (Base), bStocks `NVDAB` (BNB). Others: Tether XAUT, Paxos PAXG, Maple syrupUSDC/USDT, USD.AI sUSDai, Ethena USDtb, Theo thBILL, Backed bCSPX, Ondo USDY.
- **Baskets:**
  - *Index* — Reserve DTF, a single ERC-20 per basket, onchain mint/redeem. 18 of them, TVL ~$22M. Quotes: Reserve mint, 2 aggregators, CoW Swap, PancakeSwap X. No HyperDex fee.
  - *Automated* — via Glider (`/data/glider-baskets.json`: id, slug, name, description, chainId, oneYearReturn, investors, rebalanceHours, holdings[{address, chainId, symbol, decimals, weight}]). A personal per-user account, rebalanced on a schedule, 0.5% per swap.
  - *Strategy* — just a list of stocks with weights, no token: the client does N separate swaps (N signatures). Weights: target / equal / custom sliders. Sell 25/50/100%.
- **Pools:** 199 Uniswap v4 pools on Robinhood Chain and Base, stock pairs against **USDG**. Liquidity ~$9.7M, 24h volume ~$8.9K. Fee APR = daily fees × 365 / liquidity.
- **Lend:** a wrapper over Kamino (Solana), xStocks / STRCx / Sentora markets. Supply, Borrow, Multiply. No fee.
- **Explorer:** a log of all their own swaps/bridges with statuses Pending / Done / Partial / Refunded / Failed. Their real volume is tiny (40 transactions, ~$2.3K) — the niche is wide open.
- **Private swaps** — we will NOT do this (regulatory risk).

## 3. Current state of the repo (what exists)

- One chain: Robinhood Chain 4663 (`src/lib/chains.ts`, `src/lib/wagmi.ts`), wagmi 3 + viem 2, our own connect-button.
- Swaps: Uniswap **V3** SwapRouter02 `exactInputSingle`, single hop only (`src/lib/uniswap.ts`, `src/app/app/swap-panel.tsx`). **No v4, no USDG → stocks can't currently be bought on Robinhood Chain. This is blocker #1.**
- Market data: GeckoTerminal (`src/lib/geckoterminal.ts`, network `robinhood`).
- Indexer: V3 `PoolCreated` + `Swap` into Supabase (`src/lib/indexer/*`, `supabase/migrations/0001_indexer.sql`), a daily cron (`vercel.json`).
- Wallet analytics (`wallet-pnl.ts`, `wallet-positions.ts`, `indexed-smart-money.ts`) — all in WETH, assumes pairs against WETH.
- Token scanner `src/lib/token-security.ts` + `src/lib/evm/*` (bytecode, proxy, capabilities, holders, Blockscout, GoPlus, QuickIntel).
- `contracts/src/DcaVault.sol` + `TwapOracle.sol` — written, tested, **not deployed, not audited**.
- Dead weight for RWA: `/fees` + `/api/scan` + `bot-fees.ts` (Solana), `/trade` (Jupiter), `/app/launch`, `/app/otc`, the constellation map. The home page `/` redirects to `/fees`.

## 4. Principles

- Non-custodial: the user signs everything themselves, we never hold funds.
- Nothing invented: contract addresses (Uniswap v4 PoolManager / V4Quoter / UniversalRouter / Permit2 / StateView on 4663, USDG, stock addresses) come from official sources (Uniswap `deployments/4663.md`, Blockscout, issuer token lists) and get a source cited in a comment, the way `uniswap.ts` already does it.
- RPC keys server-side only (see the comment in `wagmi.ts`).
- Cover all new logic with vitest tests wherever there's actual logic (quotes, premium, scoring, PnL).
- Don't break what exists: old memecoin sections are removed from navigation, but code is only deleted in phase 0, and only what's explicitly listed.
- Geoblocking and disclaimers: tokenized stocks are unavailable to US residents and sanctioned countries — a banner plus a geo-based trading block (Vercel `x-vercel-ip-country`), a disclaimer on every asset page, "not investment advice."

## 5. Data model (Supabase, new migration `0002_rwa.sql`)

- `rwa_issuers` — id, name, suffix, website, description, backing_note.
- `rwa_underlyings` — ticker (PK, e.g. NVDA), name, category (`stock|etf|commodity|treasury|private_credit`), exchange, reference_source.
- `rwa_tokens` — chain_id, address, underlying_ticker, issuer_id, symbol, decimals, is_proxy, verified, first_seen_block, logo_url. PK (chain_id, address).
- `rwa_prices` — token ref, price_usd, reference_price_usd, premium_bps, liquidity_usd, volume_24h_usd, mkt_cap_usd, ts. (We keep snapshots for premium charts.)
- `rwa_risk` — token ref, admin_address, upgradeable, can_pause, can_blacklist/freeze, can_force_transfer/burn, mint_role_holders, score 0–100, checked_at, raw jsonb.
- `rwa_pools` — chain_id, pool_id/address, dex (`uniswap_v3|uniswap_v4`), token0, token1, fee, tick_spacing, hooks, liquidity_usd, volume_24h_usd.
- `baskets` — id, kind (`strategy|index|automated`), name, description, chain_id, holdings jsonb [{token, weight}], source (`auevo|reserve|glider`), one_year_return.
- `app_transfers` — our explorer: user, src/dst chain+token+amount, route, tx hashes, status, usd_value, created_at.
- `alerts` — user (address), type (`premium|listing|whale|price`), params jsonb, channel (web/telegram stub for now).
- Indexer: extend `indexer_pools`/`indexer_swaps` with a `dex` field and `pool_id bytes32` for v4.

RLS: public read for catalog tables, write only via the service role.

## 6. Section layout (routes)

Storefront (public):
- `/` — landing page: "Every tokenized stock. Every issuer. Scanned." Blocks: live top lists, a scanner preview (top premiums/discounts), baskets, issuers.
- `/app/assets` — catalog (issuer/category/chain filters, sorts, Most Traded / Top / Most Available) **+ scanner columns: premium %, risk score, $10K depth**.
- `/app/assets/[ticker]` — asset page: the token's chart overlaid on the real stock's chart, an "issuer × chain" matrix with price, premium, liquidity, risk score and a Trade button per row; a swap card; holders; trades; smart money on this ticker; issuer descriptions; a disclaimer.
- `/app/swap` — Swap (single chain) / Bridge (cross-chain), a comparison of Best Return / Fastest routes, status tracking.
- `/app/baskets` — Strategy / Index / (Automated later).
- `/app/pools` — a list of v4/v3 pools holding RWA, with liquidity, volume, fee APR.
- `/app/lend` — supply/borrow rates on RWA (read-only aggregator, deposits later).
- `/app/issuers` — issuers with their metrics.
- `/app/explorer` — our own transactions.
- `/app/portfolio` — a wallet's RWA portfolio in USD.

Scanner:
- `/app/scanner` — the scanner's main screen, tabs:
  - **Premium** — all tokens, sorted by |premium| against the real price; a "trading hours only" filter.
  - **Arbitrage** — pairs of tokens for the same ticker across different issuers/chains with the largest spread, accounting for depth and an estimated bridging cost.
  - **Risk** — risk scoring of contracts.
  - **Liquidity** — how much can be bought/sold at $1K/$10K/$100K at ≤1% slippage.
  - **New** — new RWA tokens and pools (from the indexer).
  - **Smart Money** — wallets accumulating stocks; large trades.
- Alerts: subscribe to premium > X, a new ticker listing, a large trade.

Sidebar (`src/app/app/sidebar.tsx`) — rebuild around these sections. Remove the old memecoin sections from navigation.

## 7. Phases

### Phase 0 — cleanup and scaffolding (0.5–1 day)
- Remove `/fees`, `/trade`, `/app/launch`, `/app/otc`, the constellation map from navigation. `/` no longer redirects to `/fees` — a temporary landing page instead.
- Move the Solana fee scanner under `/legacy/fees` (don't delete it), exclude it from the sitemap.
- New sidebar covering all sections from section 6; empty sections use the existing `coming-soon.tsx`.
- A geo-banner + a disclaimer component.
- ✅ Done when: `npm run build` and `npm test` are green, the new navigation is in place, the old pages are not in the menu.

### Phase 1 — asset registry and prices (2–4 days)
- Migration `0002_rwa.sql` (section 5).
- Seed issuers (the 12 from section 2) and the base tickers.
- Token collector `src/lib/rwa/registry.ts` + cron `/api/cron/rwa-registry`:
  - Robinhood Chain: collect all stock tokens (token list / Blockscout / v4 pools against USDG). Known examples to check against (verify on Blockscout): NVDA `0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec`, TSM `0x58ffe4a942d3885baa22d7520691f611ef09e7aa`.
  - Other chains/issuers: LI.FI `GET https://li.quest/v1/tokens?chains=...` + matching against issuer suffixes (section 2) and an allowlist. Anything doubtful gets `verified=false` and is hidden from the UI.
- Reference price for the underlying stock, `src/lib/rwa/reference-price.ts`: Chainlink/Pyth feeds first where available, otherwise an external quotes API (key in env, provider abstraction, caching). If there's no source — premium = null, never invented.
- NYSE trading-session utility (`src/lib/rwa/market-hours.ts`): open/closed/pre/post, holidays, tests.
- A price/liquidity cron every 5 min (GeckoTerminal for pools + the reference price) → `rwa_prices`.
- ✅ Done when: the table holds all Robinhood Chain tokens plus the major issuers on ETH/BNB/Base/Solana, each one has a price and (where possible) a premium; tests cover ticker matching and market-hours.

### Phase 2 — trading on Robinhood Chain via Uniswap v4 (3–5 days) — BLOCKER, priority #1
- `src/lib/uniswap-v4.ts`: v4 addresses on 4663 from the official deployment; pool lookup (PoolKey: currency0/1, fee, tickSpacing, hooks) via the indexer/StateView; quotes via V4Quoter.
- Execution through UniversalRouter + Permit2 (approve Permit2 once, sign a permit, V4_SWAP command). Support multi-hop ETH → USDG → STOCK and STOCK → USDG.
- SwapPanel: picks the better of the v3 and v4 routes; shows min received, price impact, the fee, a warning outside trading hours.
- Platform fee (env `AUEVO_FEE_BPS`, default 30 bps, address `AUEVO_FEE_RECIPIENT`) — taken from the input token as a separate router command (PAY_PORTION/transfer), visible transparently in the quote.
- Log every trade to `app_transfers`.
- ✅ Done when: on a fork/mainnet, a small-size buy and sell of NVDA for USDG and for ETH both go through; unit tests cover command encoding and minOut calculation.

### Phase 3 — storefront: Assets, asset page, Issuers (3–5 days)
- `/app/assets`, `/app/assets/[ticker]`, `/app/issuers` per section 6.
- Charts — the existing lightweight-charts; overlay the reference price as a second line.
- Trade button in the issuer matrix: for Robinhood Chain — our own SwapPanel, for everything else — the Bridge flow from phase 4 (until it's ready — an external link/disabled).
- ✅ Done when: the catalog and the NVDA page show every token for the ticker with prices and premium, and buying on Robinhood Chain works from the page.

### Phase 4 — Swap & Bridge via LI.FI (3–4 days)
- Server-side proxy `/api/lifi/*` (key and integrator server-side), `integrator=auevo`, `fee` = `AUEVO_FEE_BPS`.
- Multichain wagmi: Ethereum, Base, BNB, Arbitrum, HyperEVM + Robinhood Chain; Solana — via LI.FI with a Solana wallet (can be pushed to the end of the phase).
- UI like HyperDex's: a list of routes labeled Best Return / Fastest, quote auto-refresh every ~60s, a step overlay (approve → send → bridge → receive) with explorer links, status via LI.FI `/status`.
- `/app/explorer` built on `app_transfers`.
- ✅ Done when: a USDC Base → USDG Robinhood Chain bridge and buying NVDAx on Solana / NVDAon on BNB both work from the UI, and status tracking runs to completion.

### Phase 5 — scanner (4–6 days)
- **Risk scoring** `src/lib/rwa/risk.ts` built on `evm/proxy.ts`, `evm/capabilities.ts`, `evm/bytecode.ts`: admin proxy (EIP-1967), roles (AccessControl `hasRole`, owner), pause/blacklist/freeze/forceTransfer/burnFrom/mint selectors, who holds MINTER_ROLE. A transparent formula, weights in config, the UI shows a breakdown of "why this score." This is NOT a "scam score" — it's "how much the issuer can interfere with your token."
- **Liquidity depth**: for each token, a quote at $1K/$10K/$100K → price impact.
- **Premium / Arbitrage**: tables from `rwa_prices`, the spread between tokens of the same ticker net of an estimated LI.FI route cost.
- **New listings**: the indexer catches new v4 pools against USDG and new tokens from the registry.
- `/app/scanner` with the tabs from section 6 + scanner columns in `/app/assets`.
- ✅ Done when: every tab works on live data, every score comes with an explanation, and tests cover scoring and the arbitrage calculation.

### Phase 6 — v4 indexer and smart money on stocks (3–5 days)
- Indexer: `Initialize` and `Swap` events from the v4 PoolManager (one contract) on 4663, with `dex` and `pool_id` fields.
- Generalize the quote leg: WETH → any of {USDG, USDC, WETH}, PnL and positions in USD (`wallet-pnl.ts`, `wallet-positions.ts`, `indexed-smart-money.ts`) — without breaking existing tests, add new ones.
- Trader attribution: for v4, via UniversalRouter recipient/tx.from (check how this is currently done in `indexed-smart-money.ts`).
- Indexer cron — every 5 min (Vercel cron or external).
- A Smart Money tab plus a block on the asset page; `/app/portfolio` in USD.
- ✅ Done when: the stock leaderboard and a wallet's USD portfolio are both computed from the indexer.

### Phase 7 — baskets (4–7 days)
- **Strategy baskets** (our own, `source=auevo`): a JSON/table of baskets (themes: Mag7, AI chips, energy, investor trackers — weights taken from public 13F filings only, with the source/date cited). Weights: target / equal / custom sliders. **Single-transaction purchase** via UniversalRouter (several V4_SWAP calls in one execute) — the main improvement over HyperDex (which needs N signatures). Sell 25/50/100%. If one leg has no route, exclude it and redistribute.
- **Index baskets**: integrate Reserve DTF (reading composition, NAV, mint/redeem or purchase via an aggregator) on whichever chains have them. Show NAV vs market price — another scanner metric.
- **DCA**: adapt `DcaVault` to USDG + v4 (or UniversalRouter), recurring buys of a stock/basket. **Mainnet deploy only after an external audit** — until then, testnet/fork only, UI behind a feature flag.
- Automated (rebalanced accounts) — not doing this in this iteration.
- ✅ Done when: buying a basket of 5–10 stocks in one signature works on Robinhood Chain.

### Phase 8 — pools, lending, alerts (as time allows)
- `/app/pools`: a list of RWA v3/v4 pools with liquidity/volume/fee APR (HyperDex's formula). Adding v4 liquidity — later.
- `/app/lend`: a read-only rate table (Kamino xStocks markets via their public API + Robinhood Chain lending markets, if any appear). Deposits — later.
- Alerts: web notifications + a Telegram bot (premium > X, new listing, a large trade on a ticker).

## 8. Env (add to `.env.example`)

```
LIFI_API_KEY=
AUEVO_FEE_BPS=30
AUEVO_FEE_RECIPIENT=
REFERENCE_PRICE_PROVIDER=      # chainlink|pyth|<api>
REFERENCE_PRICE_API_KEY=
RPC_ETHEREUM= RPC_BASE= RPC_BSC= RPC_ARBITRUM= RPC_HYPEREVM=
SOLANA_RPC_URL=
```

## 9. What not to do

- Private swaps / mixers.
- Our own lending contracts and our own automated vaults.
- Deploying DcaVault to mainnet without an audit.
- Hardcoding addresses without a source.
- Showing `verified=false` tokens in the storefront.
