/**
 * GeckoTerminal's On-Chain DEX API — real price, market cap, liquidity,
 * volume and OHLCV for Robinhood Chain, already indexed under network id
 * "robinhood" (confirmed at geckoterminal.com/robinhood/pools).
 *
 * This replaces an earlier approach of decoding Uniswap V3 PoolCreated
 * events straight off Blockscout: that gave pair discovery only — a pool
 * address and its two tokens, nothing about price, liquidity or volume,
 * since none of that is in the event itself. It also never showed
 * anything already trading, only brand-new pools, which undersells what
 * "Market" should be. GeckoTerminal is a purpose-built, publicly
 * documented DEX indexer already covering this chain: free, no API key —
 * but a 30 req/min rate limit *shared across every visitor to the site*,
 * not per-visitor. Every call here goes through Next.js's own fetch
 * cache (`next: { revalidate }`) rather than a raw uncached fetch, so
 * traffic from many concurrent users collapses onto one upstream call
 * per cache window instead of multiplying it — without that, a handful
 * of open tabs is enough to start hitting 429s, which is what silently
 * empty market/trade data in production almost always was.
 *
 * Every parser here treats an unexpected shape as "give up and return
 * null/empty", never as a thrown exception that takes the whole page
 * down — a market screener with a gap in it is still useful; one that
 * 500s because one field renamed is not.
 */

const NETWORK = "robinhood";

function baseUrl(): string {
  const configured = process.env.GECKOTERMINAL_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "https://api.geckoterminal.com/api/v2";
}

/**
 * Deliberately separate from lib/evm/http.ts's fetchJson: that one is
 * `cache: "no-store"` on purpose (the security scanner must never trust
 * a stale read), which is the wrong default here — GeckoTerminal data is
 * fine a few seconds stale, and caching it is what keeps this app inside
 * the shared rate limit at all.
 */
async function geckoFetch<T>(
  url: string,
  revalidateSeconds: number,
  timeoutMs = 10_000
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface JsonApiRef {
  data: { id: string; type: string } | null;
}

interface PoolRelationships {
  base_token?: JsonApiRef;
  quote_token?: JsonApiRef;
  dex?: JsonApiRef;
}

interface TxWindow {
  buys?: number;
  sells?: number;
  buyers?: number;
  sellers?: number;
}

interface PoolAttributes {
  address?: string;
  name?: string;
  pool_created_at?: string;
  base_token_price_usd?: string;
  price_change_percentage?: { m5?: string; h1?: string; h6?: string; h24?: string };
  volume_usd?: { m5?: string; h1?: string; h6?: string; h24?: string };
  transactions?: { m5?: TxWindow; h1?: TxWindow; h24?: TxWindow };
  fdv_usd?: string | null;
  market_cap_usd?: string | null;
  reserve_in_usd?: string | null;
}

interface TokenAttributes {
  address?: string;
  name?: string;
  symbol?: string;
  image_url?: string | null;
}

interface DexAttributes {
  name?: string;
}

interface IncludedDoc {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

interface PoolDoc {
  id: string;
  type: string;
  attributes?: PoolAttributes;
  relationships?: PoolRelationships;
}

interface PoolListResponse {
  data?: PoolDoc[];
  included?: IncludedDoc[];
}

interface PoolSingleResponse {
  data?: PoolDoc | null;
  included?: IncludedDoc[];
}

export interface MarketToken {
  address: string | null;
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;
}

export interface MarketPool {
  /** GeckoTerminal's own pool id ("robinhood_0x…") — stable, safe as a React key. */
  id: string;
  poolAddress: string | null;
  dexName: string | null;
  createdAt: string | null;
  ageSeconds: number | null;
  baseToken: MarketToken;
  quoteToken: MarketToken;
  priceUsd: number | null;
  change: {
    m5: number | null;
    h1: number | null;
    h6: number | null;
    h24: number | null;
  };
  volumeUsd24h: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  txns24h: { buys: number | null; sells: number | null } | null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function includedLookup(included: IncludedDoc[]): Map<string, IncludedDoc> {
  const map = new Map<string, IncludedDoc>();
  for (const doc of included) {
    if (doc?.type && doc?.id) map.set(`${doc.type}:${doc.id}`, doc);
  }
  return map;
}

function resolveToken(ref: JsonApiRef | undefined, lookup: Map<string, IncludedDoc>): MarketToken {
  const empty: MarketToken = { address: null, symbol: null, name: null, imageUrl: null };
  if (!ref?.data) return empty;

  const doc = lookup.get(`${ref.data.type}:${ref.data.id}`);
  const attrs = (doc?.attributes ?? {}) as TokenAttributes;
  return {
    address: typeof attrs.address === "string" ? attrs.address : null,
    symbol: typeof attrs.symbol === "string" ? attrs.symbol : null,
    name: typeof attrs.name === "string" ? attrs.name : null,
    imageUrl: typeof attrs.image_url === "string" ? attrs.image_url : null,
  };
}

function resolveDexName(ref: JsonApiRef | undefined, lookup: Map<string, IncludedDoc>): string | null {
  if (!ref?.data) return null;
  const doc = lookup.get(`${ref.data.type}:${ref.data.id}`);
  const attrs = (doc?.attributes ?? {}) as DexAttributes;
  return typeof attrs.name === "string" ? attrs.name : null;
}

function mapPool(doc: PoolDoc, lookup: Map<string, IncludedDoc>): MarketPool | null {
  const a = doc.attributes;
  if (!a) return null;

  const createdAt = typeof a.pool_created_at === "string" ? a.pool_created_at : null;
  const createdMs = createdAt ? Date.parse(createdAt) : NaN;
  const ageSeconds = Number.isFinite(createdMs) ? Math.max(0, (Date.now() - createdMs) / 1000) : null;

  const buys = toNumber(a.transactions?.h24?.buys);
  const sells = toNumber(a.transactions?.h24?.sells);

  return {
    id: doc.id,
    poolAddress: typeof a.address === "string" ? a.address : null,
    dexName: resolveDexName(doc.relationships?.dex, lookup),
    createdAt,
    ageSeconds,
    baseToken: resolveToken(doc.relationships?.base_token, lookup),
    quoteToken: resolveToken(doc.relationships?.quote_token, lookup),
    priceUsd: toNumber(a.base_token_price_usd),
    change: {
      m5: toNumber(a.price_change_percentage?.m5),
      h1: toNumber(a.price_change_percentage?.h1),
      h6: toNumber(a.price_change_percentage?.h6),
      h24: toNumber(a.price_change_percentage?.h24),
    },
    volumeUsd24h: toNumber(a.volume_usd?.h24),
    fdvUsd: toNumber(a.fdv_usd),
    marketCapUsd: toNumber(a.market_cap_usd),
    liquidityUsd: toNumber(a.reserve_in_usd),
    txns24h: buys === null && sells === null ? null : { buys, sells },
  };
}

/**
 * Pools on Robinhood Chain — "all" (already trading, ranked by 24h
 * volume) or "radar" (freshly created, newest-pool-first). Pages through
 * up to `pages` pages of GeckoTerminal's own listing (20 pools/page, up
 * to 10 pages on the free tier) and merges them, since a single page was
 * the reason the screener only ever showed a handful of pairs. Fetched
 * in parallel and cached (25s per page) so raising this doesn't raise
 * the real request rate anywhere near as much as it raises pair count.
 *
 * GeckoTerminal's own docs and changelog disagree with themselves on
 * whether the sort query param is named `sort` or `order` — both are
 * sent so it works either way; an unrecognized param is just ignored,
 * never an error.
 */
export async function fetchMarketPools(
  kind: "all" | "radar" = "all",
  pages = 5
): Promise<MarketPool[]> {
  const endpoint = kind === "radar" ? "new_pools" : "pools";
  const sortParams = kind === "all" ? "&sort=h24_volume_usd_desc&order=h24_volume_usd_desc" : "";

  const pageNumbers = Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1);
  const responses = await Promise.all(
    pageNumbers.map((page) =>
      geckoFetch<PoolListResponse>(
        `${baseUrl()}/networks/${NETWORK}/${endpoint}?page=${page}${sortParams}&include=base_token,quote_token,dex`,
        25
      )
    )
  );

  const seen = new Set<string>();
  const pools: MarketPool[] = [];
  for (const json of responses) {
    if (!json || !Array.isArray(json.data)) continue;
    const lookup = includedLookup(json.included ?? []);
    for (const doc of json.data) {
      const pool = mapPool(doc, lookup);
      if (pool && !seen.has(pool.id)) {
        seen.add(pool.id);
        pools.push(pool);
      }
    }
  }
  return pools;
}

/** A single pool, keyed by its own on-chain address — what the token detail page loads. */
export async function fetchMarketPool(poolAddress: string): Promise<MarketPool | null> {
  const url = `${baseUrl()}/networks/${NETWORK}/pools/${poolAddress}?include=base_token,quote_token,dex`;
  const json = await geckoFetch<PoolSingleResponse>(url, 15);
  if (!json?.data) return null;

  const lookup = includedLookup(json.included ?? []);
  return mapPool(json.data, lookup);
}

export type OhlcvTimeframe = "day" | "hour" | "minute";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OhlcvResponse {
  data?: {
    attributes?: {
      ohlcv_list?: unknown[];
    };
  };
}

/**
 * Candlesticks for one pool. `aggregate` is GeckoTerminal's bucket-size
 * multiplier within a timeframe (e.g. timeframe "minute", aggregate 15 →
 * 15-minute candles) — see their docs for the allowed values per
 * timeframe; an unsupported combination is answered with an empty list,
 * not a thrown error, same as every other gap here.
 */
export async function fetchOhlcv(
  poolAddress: string,
  timeframe: OhlcvTimeframe,
  aggregate = 1,
  limit = 200
): Promise<Candle[]> {
  const url =
    `${baseUrl()}/networks/${NETWORK}/pools/${poolAddress}/ohlcv/${timeframe}` +
    `?aggregate=${aggregate}&limit=${limit}&currency=usd&token=base`;

  const json = await geckoFetch<OhlcvResponse>(url, 30);
  const rows = json?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) return [];

  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [timestamp, open, high, low, close, volume] = row as unknown[];
    if (
      typeof timestamp !== "number" ||
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number" ||
      typeof volume !== "number"
    ) {
      continue;
    }
    candles.push({ timestamp, open, high, low, close, volume });
  }
  // GeckoTerminal returns newest-first; charts want oldest-first.
  return candles.reverse();
}

export interface TokenInfo {
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
}

interface TokenInfoResponse {
  data?: {
    attributes?: {
      description?: string | null;
      websites?: string[] | null;
      twitter_handle?: string | null;
      telegram_handle?: string | null;
      discord_url?: string | null;
    };
  };
}

/**
 * Best-effort social/description metadata for a token — community-
 * submitted to GeckoTerminal, not verified by us. Every field is null
 * unless GeckoTerminal actually has it; nothing here is a fallback or a
 * guess, so a page rendering this can only ever show real links or
 * nothing, never a broken one.
 */
export async function fetchTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
  const url = `${baseUrl()}/networks/${NETWORK}/tokens/${tokenAddress}/info`;
  const json = await geckoFetch<TokenInfoResponse>(url, 3_600);
  const attrs = json?.data?.attributes;
  if (!attrs) return null;

  return {
    description: typeof attrs.description === "string" ? attrs.description : null,
    website: Array.isArray(attrs.websites) && typeof attrs.websites[0] === "string" ? attrs.websites[0] : null,
    twitter: typeof attrs.twitter_handle === "string" ? attrs.twitter_handle : null,
    telegram: typeof attrs.telegram_handle === "string" ? attrs.telegram_handle : null,
    discord: typeof attrs.discord_url === "string" ? attrs.discord_url : null,
  };
}

export interface Trade {
  txHash: string | null;
  traderAddress: string | null;
  kind: "buy" | "sell" | null;
  volumeUsd: number | null;
  fromTokenAmount: number | null;
  toTokenAmount: number | null;
  priceUsd: number | null;
  blockTimestamp: string | null;
  ageSeconds: number | null;
  poolAddress: string;
  baseToken: MarketToken;
  quoteToken: MarketToken;
}

interface TradeAttributes {
  tx_hash?: string;
  tx_from_address?: string;
  kind?: string;
  volume_in_usd?: string;
  from_token_amount?: string;
  to_token_amount?: string;
  price_to_in_usd?: string;
  block_timestamp?: string;
}

interface TradesResponse {
  data?: { attributes?: TradeAttributes }[];
}

/**
 * A pool's own recent trades above a USD size floor — the one GeckoTerminal
 * endpoint that gives individual swaps rather than aggregated stats.
 * `minUsd` is sent as their own `trade_volume_in_usd_greater_than` filter,
 * so a "large swaps" feed doesn't have to pull every trade and filter
 * client-side.
 */
export async function fetchPoolTrades(
  poolAddress: string,
  baseToken: MarketToken,
  quoteToken: MarketToken,
  minUsd = 0
): Promise<Trade[]> {
  const url =
    `${baseUrl()}/networks/${NETWORK}/pools/${poolAddress}/trades` +
    (minUsd > 0 ? `?trade_volume_in_usd_greater_than=${minUsd}` : "");

  const json = await geckoFetch<TradesResponse>(url, 12);
  if (!json || !Array.isArray(json.data)) return [];

  const trades: Trade[] = [];
  for (const doc of json.data) {
    const a = doc.attributes;
    if (!a) continue;

    const blockTimestamp = typeof a.block_timestamp === "string" ? a.block_timestamp : null;
    const ts = blockTimestamp ? Date.parse(blockTimestamp) : NaN;

    trades.push({
      txHash: typeof a.tx_hash === "string" ? a.tx_hash : null,
      traderAddress: typeof a.tx_from_address === "string" ? a.tx_from_address : null,
      kind: a.kind === "buy" || a.kind === "sell" ? a.kind : null,
      volumeUsd: toNumber(a.volume_in_usd),
      fromTokenAmount: toNumber(a.from_token_amount),
      toTokenAmount: toNumber(a.to_token_amount),
      priceUsd: toNumber(a.price_to_in_usd),
      blockTimestamp,
      ageSeconds: Number.isFinite(ts) ? Math.max(0, (Date.now() - ts) / 1000) : null,
      poolAddress,
      baseToken,
      quoteToken,
    });
  }
  return trades;
}

/**
 * Large swaps across the chain's most active pools — the "large trades"
 * feed. Deliberately not a "smart money" wallet score: nothing here
 * claims a wallet is skilled, only that it made a trade over `minUsd`.
 * Fans out across the top `poolLimit` pools by GeckoTerminal's own
 * ranking (already fetched for the Market page's ALL tab) since there is
 * no chain-wide trades endpoint on the free API — one call per pool, all
 * of them cached the same as everywhere else in this module.
 */
export async function fetchLargeTrades(minUsd = 5_000, poolLimit = 12): Promise<Trade[]> {
  const pools = await fetchMarketPools("all", 1);
  const top = pools.slice(0, poolLimit).filter((p) => p.poolAddress);

  const perPool = await Promise.all(
    top.map((pool) =>
      fetchPoolTrades(pool.poolAddress as string, pool.baseToken, pool.quoteToken, minUsd)
    )
  );

  const all = perPool.flat();
  // Newest first; a trade with no parseable timestamp sorts last rather
  // than dropping it.
  all.sort((a, b) => {
    if (a.ageSeconds === null) return 1;
    if (b.ageSeconds === null) return -1;
    return a.ageSeconds - b.ageSeconds;
  });

  return all.slice(0, 60);
}
