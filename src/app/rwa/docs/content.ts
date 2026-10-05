/**
 * /rwa/docs content — a GitBook-style layout (left sidebar of
 * sections/pages, right the page itself) needs somewhere to read pages
 * from. Plain data instead of MDX/markdown files: this app has no MDX
 * pipeline set up, and a typed block array is enough for prose, lists,
 * callouts and a table without adding a new build dependency for it.
 *
 * Scoped to the RWA trading platform only — the Proof Protocol docs for
 * agents live at /docs, a separate tree, reachable only from the main
 * Auevo chrome, never from inside /rwa. This file used to be shared
 * between both products; it was split in two so each docs tree only
 * ever shows pages relevant to the product the reader is actually in.
 *
 * Every fact below is grounded in this app's own code or
 * docs/RWA_SPEC.md — the issuer list matches
 * supabase/migrations/0003_rwa.sql's seed exactly, the chain list
 * matches src/lib/rwa/lifi/chains.ts's LIFI_EVM_CHAINS, the scanner tabs
 * match src/app/app/scanner/page.tsx's TABS, and the risk language is
 * the same copy src/app/disclaimer.tsx already shows on every asset
 * page — nothing here is aspirational copy for a feature that doesn't
 * exist yet.
 */

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; tone: "info" | "warn"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface DocPage {
  slug: string;
  title: string;
  summary: string;
  blocks: DocBlock[];
}

export interface DocSection {
  id: string;
  title: string;
  pages: DocPage[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    pages: [
      {
        slug: "welcome",
        title: "Welcome to Auevo",
        summary: "What Auevo is, and what it isn't.",
        blocks: [
          {
            type: "p",
            text: "Auevo is a marketplace and scanner for tokenized real-world assets (RWAs) — stocks, ETFs, commodities, treasuries and private credit — across issuers and chains, starting on Robinhood Chain.",
          },
          {
            type: "p",
            text: "The registry only lists a token once this app has verified it against a real, cited source: an issuer's own token list, or a chain's own contract data. A ticker with no verified token anywhere never appears — there is no placeholder or estimated listing.",
          },
          {
            type: "callout",
            tone: "info",
            text: "Auevo does not issue, custody, or guarantee any of these tokens, and runs no lending or bridge infrastructure of its own — it reads and routes through the issuers, chains and protocols that do.",
          },
          {
            type: "h2",
            text: "What you can do here",
          },
          {
            type: "list",
            items: [
              "Browse every tokenized stock/ETF the registry has found, with live premium and risk score (Assets)",
              "Rank the whole registry by premium, arbitrage spread, contract risk, liquidity or new listings (Scanner)",
              "Buy 5–10 stocks in one wallet signature (Baskets)",
              "See v4 RWA/USDG pool liquidity, volume and fee APR (Pools)",
              "Swap on Robinhood Chain, or bridge tokenized assets in from five other chains (Swap & Bridge)",
              "Check Kamino's own tokenized-stock lending rates, read-only (Lend)",
              "Get a web or Telegram alert on a premium spike, new listing or whale trade (Alerts)",
            ],
          },
        ],
      },
      {
        slug: "connect-a-wallet",
        title: "Connecting a wallet",
        summary: "How wallet connection works, and what it does and doesn't unlock.",
        blocks: [
          {
            type: "p",
            text: "The \"Connect wallet\" button in the top-right of the workspace opens your browser wallet's own connection prompt. Auevo never asks for a seed phrase or private key, and never has custody of your funds at any point — every trade you make signs a transaction that goes straight from your wallet to the underlying protocol (Uniswap v4, LI.FI, Kamino).",
          },
          {
            type: "p",
            text: "Connecting is optional for browsing: Assets, Scanner, Pools and Lend all work with no wallet connected. A wallet is needed to trade, view your own Portfolio, or subscribe to Alerts.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "If your wallet is connected to a different network than Robinhood Chain, the workspace shows a notice and balances won't resolve until you switch networks in your wallet.",
          },
        ],
      },
      {
        slug: "supported-chains",
        title: "Supported chains",
        summary: "Where Auevo trades directly, and where it can bridge assets in from.",
        blocks: [
          {
            type: "p",
            text: "Robinhood Chain is where Auevo's own trading (Baskets, Pools, the primary Swap route) happens. Swap & Bridge additionally routes in tokenized assets from five other EVM chains through LI.FI, whichever of these has the best available route for a given trade:",
          },
          {
            type: "table",
            headers: ["Chain", "Role"],
            rows: [
              ["Robinhood Chain", "Primary — Uniswap v4 pools, baskets, native trading"],
              ["Ethereum", "Bridge source via LI.FI"],
              ["Base", "Bridge source via LI.FI"],
              ["BNB Smart Chain", "Bridge source via LI.FI"],
              ["Arbitrum One", "Bridge source via LI.FI"],
              ["HyperEVM", "Bridge source via LI.FI"],
            ],
          },
          {
            type: "callout",
            tone: "info",
            text: "Solana support is on the roadmap but not built yet — every chain above is EVM.",
          },
        ],
      },
    ],
  },
  {
    id: "assets",
    title: "Assets & issuers",
    pages: [
      {
        slug: "tokenized-stocks",
        title: "What is a tokenized stock?",
        summary: "The claim a token actually represents.",
        blocks: [
          {
            type: "p",
            text: "A tokenized stock, ETF or other real-world-asset token is a claim issued by a third party (its issuer) that tracks the price of the underlying asset. It is not the underlying security itself, and does not carry shareholder rights unless the issuer's own terms say otherwise.",
          },
          {
            type: "p",
            text: "Because it's a separate claim rather than the security itself, a tokenized stock can — and often does — trade at a premium or discount to the real asset's price. That gap is exactly what the Scanner's Premium tab ranks.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "Always verify an issuer's own terms and backing disclosures before trading a token you haven't used before — Auevo surfaces this information where it's available, but doesn't independently audit each issuer's backing.",
          },
        ],
      },
      {
        slug: "issuers",
        title: "Verified issuers",
        summary: "Who Auevo's registry currently recognizes.",
        blocks: [
          {
            type: "p",
            text: "The registry starts from a fixed allowlist of issuers, each with its own backing note — this is a starting catalog, not a claim that every issuer below has been independently audited by Auevo.",
          },
          {
            type: "table",
            headers: ["Issuer", "Backing note"],
            rows: [
              ["Ondo Finance", "Tokenized equities and USDY, per Ondo's own disclosures"],
              ["xStocks (Backed Finance)", "1:1 backed, per Backed Finance's own disclosures"],
              ["Robinhood", "Tokenized equities issued by Robinhood, per Robinhood's own disclosures"],
              ["Coinbase", "Tokenized equities issued by Coinbase, per Coinbase's own disclosures"],
              ["bStocks", "Tokenized equities, per bStocks' own disclosures"],
              ["Tether", "XAUT — gold-backed, per Tether's own disclosures"],
              ["Paxos", "PAXG (gold-backed) and USDG, per Paxos's own disclosures"],
              ["Maple Finance", "syrupUSDC/syrupUSDT — private credit, per Maple's own disclosures"],
              ["USD.AI", "sUSDai, per USD.AI's own disclosures"],
              ["Ethena", "USDtb, per Ethena's own disclosures"],
              ["Theo", "thBILL — treasury-backed, per Theo's own disclosures"],
              ["Backed Finance", "bCSPX and Ondo USDY-adjacent products, per Backed's own disclosures"],
            ],
          },
        ],
      },
      {
        slug: "markets",
        title: "Markets: browsing by category",
        summary: "Filtering the Assets page by stock, ETF, commodity, treasury or private credit.",
        blocks: [
          {
            type: "p",
            text: "The Assets page's category tabs split the registry the same way its own underlying catalog is classified: Stocks, ETFs, Commodities, Treasuries and Private Credit. A tab only appears once the registry has actually found a token in that category — an empty category is left off rather than shown with nothing in it.",
          },
          {
            type: "table",
            headers: ["Category", "What's in it"],
            rows: [
              ["Stocks", "Individual tokenized equities (e.g. NVDA, TSLA)"],
              ["ETFs", "Tokenized exchange-traded funds (e.g. SPY, QQQ)"],
              ["Commodities", "Asset-backed tokens tracking a physical commodity (e.g. XAUT, PAXG — gold)"],
              ["Treasuries", "Tokens backed by government debt instruments (e.g. thBILL)"],
              ["Private Credit", "Tokens representing a private-credit lending position (e.g. syrupUSDC, syrupUSDT)"],
            ],
          },
          {
            type: "callout",
            tone: "info",
            text: "Commodity, treasury and private-credit tickers don't have a reference price configured yet, so no premium is shown for them — the same \"unconfigured, not zero\" rule the Premium page explains.",
          },
        ],
      },
      {
        slug: "premium-and-discount",
        title: "Premium & discount, explained",
        summary: "How the number on every asset page is calculated.",
        blocks: [
          {
            type: "p",
            text: "Premium is the percentage gap between a token's on-chain trading price and a reference price for the real underlying asset, in basis points (100 bps = 1%). A positive premium means the token is trading above the real asset's price; a negative one (a discount) means it's trading below.",
          },
          {
            type: "p",
            text: "Premium is only ever shown for tickers with a reference price actually configured — a blank premium means the reference price isn't wired up yet, never a silent zero.",
          },
        ],
      },
    ],
  },
  {
    id: "scanner",
    title: "Scanner",
    pages: [
      {
        slug: "overview",
        title: "Scanner overview",
        summary: "Seven ranked views over the same registry.",
        blocks: [
          {
            type: "p",
            text: "The Scanner ranks the whole asset registry from seven different angles instead of one flat list. Every tab reads the same underlying data the Assets page does — nothing here is a separate, unaudited data source.",
          },
          {
            type: "table",
            headers: ["Tab", "What it ranks"],
            rows: [
              ["Premium", "Tokens by how far their on-chain price sits from the real asset's price"],
              ["Arbitrage", "The same ticker across two different issuers or chains, ranked by the spread between them"],
              ["Risk", "Contract risk score — mint/pause/blacklist/freeze/force-transfer/upgradeability capability checks"],
              ["Liquidity", "Pool depth for a ticker's Robinhood Chain trading pair"],
              ["New", "Tokens the registry has most recently discovered"],
              ["Smart Money", "Wallets with the strongest realized track record trading these tokens, from the on-chain indexer"],
              ["Alerts", "Your own subscribed premium/listing/whale-trade alerts and their delivery history"],
            ],
          },
          {
            type: "callout",
            tone: "info",
            text: "A risk score reflects on-chain contract capabilities Auevo can actually check (mint, pause, blacklist, freeze, force-transfer, upgradeability) — it is not a statement about the issuer's off-chain solvency or backing.",
          },
        ],
      },
    ],
  },
  {
    id: "trading",
    title: "Trading",
    pages: [
      {
        slug: "swap-and-bridge",
        title: "Swap & Bridge",
        summary: "Best-route trading and cross-chain bridging via LI.FI.",
        blocks: [
          {
            type: "p",
            text: "Swap & Bridge routes a trade through LI.FI, an aggregator that compares routes across DEXs and bridges rather than using a single one — so a trade in from another chain gets whichever path LI.FI's own routing finds best at that moment, not a fixed route Auevo hardcodes.",
          },
          {
            type: "p",
            text: "Trading natively on Robinhood Chain (no bridging involved) routes directly through Uniswap v4's own UniversalRouter.",
          },
        ],
      },
      {
        slug: "baskets",
        title: "Baskets",
        summary: "5–10 stocks, one wallet signature.",
        blocks: [
          {
            type: "p",
            text: "A Strategy basket is a themed set of tokenized stocks (e.g. the Mag7, AI chips) with target weights. Buying one executes every leg's swap in a single UniversalRouter transaction — one wallet signature, not one per stock.",
          },
          {
            type: "p",
            text: "If a specific leg has no available trading route at the time of purchase, that leg is excluded and the remaining weights are redistributed proportionally, rather than failing the entire basket purchase.",
          },
          {
            type: "p",
            text: "Selling supports partial exits at 25%, 50% or 100% of your position.",
          },
          {
            type: "callout",
            tone: "info",
            text: "Index baskets (fully-backed, redeemable fund-style tokens, e.g. Reserve Protocol's DTFs) aren't offered yet — Reserve has no deployment on Robinhood Chain as of this writing. A basket-backed token launch (Auevo minting its own redeemable wrapper token backed by a basket's holdings) isn't offered either, and isn't planned: that would need Auevo to hold the backing assets in escrow in a contract of its own, the same custodial risk this app's own rules rule out for lending and vaults (see Automated rebalancing below for the non-custodial alternative this app builds instead).",
          },
          {
            type: "h2",
            text: "Automated rebalancing",
          },
          {
            type: "p",
            text: "Every basket's own page has a \"Check rebalance\" tool: it compares this wallet's actual holdings against the basket's stated target weights and, if they've drifted past 3%, prepares the exact sell/buy trade to correct it — still one signature, computed from a live quote the same way Buy and Sell already are.",
          },
          {
            type: "callout",
            tone: "info",
            text: "This is deliberately not a self-executing vault: Auevo never holds your basket assets. The tool detects drift and builds the trade; nothing moves until you review it and sign the one resulting transaction yourself.",
          },
        ],
      },
      {
        slug: "pools",
        title: "Pools",
        summary: "v4 RWA/USDG liquidity, volume and fee APR.",
        blocks: [
          {
            type: "p",
            text: "Every tokenized-stock pool discovered on Robinhood Chain trades against USDG (Paxos's stablecoin) through Uniswap v4.",
          },
          {
            type: "p",
            text: "\"Liquidity\" on the Pools page is the pool's virtual reserves at its current price (from its active liquidity) — not a full-range TVL figure. Uniswap v4 doesn't publish a subgraph this app reads from, and a true full-range TVL number needs traversing every initialized tick range, which isn't done here.",
          },
          {
            type: "p",
            text: "24h volume is summed directly from indexed on-chain swap amounts on the USDG side — no external price feed needed for that half of the pair.",
          },
          {
            type: "p",
            text: "Fee APR follows a standard formula: (daily fees × 365) ÷ liquidity.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "Adding liquidity from this page isn't built yet — Pools is a read-only view of pools that already exist.",
          },
        ],
      },
    ],
  },
  {
    id: "earn",
    title: "Earn",
    pages: [
      {
        slug: "lend",
        title: "Lend",
        summary: "Kamino's tokenized-stock lending rates, read-only.",
        blocks: [
          {
            type: "p",
            text: "The Lend page mirrors Kamino Finance's own xStocks lending market rates — supply APY, borrow APY, total supplied and total borrowed per reserve, straight from Kamino's public API.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "This page is strictly read-only. Auevo runs no lending contracts of its own — every deposit or borrow happens on Kamino itself, not here.",
          },
          {
            type: "p",
            text: "Looking for leverage (deposit, borrow, and loop automatically) rather than a single supply/borrow position? That's Kamino's own Multiply product, built on this same xStocks market — Auevo links out to it from the Lend page rather than building a second, separate leveraged-vault contract.",
          },
        ],
      },
      {
        slug: "provide-liquidity",
        title: "Provide liquidity",
        summary: "Earn trading fees on RWA/USDG pools — a real position in your own wallet.",
        blocks: [
          {
            type: "p",
            text: "Any v4 RWA/USDG pool on the Pools page can be provided liquidity to, full-range. Deposit USDG and the matching amount of the tokenized stock (computed from the pool's current price), and Uniswap mints an NFT representing your position directly to your wallet.",
          },
          {
            type: "p",
            text: "Your position earns a share of every swap fee taken on that pool going forward — the same Fee APR figure shown on the Pools page is what a full-range position in that pool has been earning. Fees accrue to the position and are claimed by decreasing or closing it (in Uniswap's own interface, or a wallet that reads v4 positions) — Auevo's own page doesn't collect or touch them at any point.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "This is real liquidity provision, with the same risks as anywhere else on Uniswap: impermanent loss if the token's price moves against your position, and thinner pools moving price more per trade. Full-range means your capital is spread across every possible price, which is simpler but earns a smaller share of fees than a narrower range would at the current price.",
          },
          {
            type: "p",
            text: "The first time you provide liquidity to a given pool, expect four approval transactions (USDG and the stock token, each to Permit2 and then to Uniswap's Position Manager) before the deposit itself — a one-time setup per pool, not a per-deposit cost.",
          },
        ],
      },
    ],
  },
  {
    id: "fees",
    title: "Fees & revenue",
    pages: [
      {
        slug: "how-auevo-makes-money",
        title: "How Auevo makes money",
        summary: "A short, direct answer — no subscription, no token, one small fee on trades.",
        blocks: [
          {
            type: "p",
            text: "Auevo takes a 0.30% fee, taken from the trade's own output rather than charged separately, on two kinds of transactions it builds: a Basket buy or sell, and a swap executed directly on Robinhood Chain. Both are single wallet-signed transactions — the fee is embedded in that same transaction, not a second charge.",
          },
          {
            type: "table",
            headers: ["Section", "Fee"],
            rows: [
              ["Baskets (buy/sell)", "0.30% of the trade, taken on-chain in the same transaction"],
              ["Swap on Robinhood Chain", "0.30% of the trade, taken on-chain in the same transaction"],
              ["Swap & Bridge (cross-chain, via LI.FI)", "No Auevo fee. LI.FI or the underlying bridge/DEX may charge its own — shown in the quoted route before you confirm"],
              ["Pools", "None — read-only, and providing liquidity earns Uniswap's own pool fee, paid directly to you, not through Auevo"],
              ["Lend", "None — read-only mirror of Kamino's own market; deposits and their terms are entirely Kamino's"],
              ["Scanner, Assets, Alerts, Docs", "None — informational, no trade involved"],
            ],
          },
          {
            type: "callout",
            tone: "info",
            text: "There is no subscription tier, no native Auevo token, and no paid or sponsored listing for any issuer or asset — the registry lists what it has verified, not what's been paid for.",
          },
        ],
      },
    ],
  },
  {
    id: "alerts",
    title: "Alerts",
    pages: [
      {
        slug: "alerts-overview",
        title: "Web & Telegram alerts",
        summary: "Get notified without watching the Scanner tab live.",
        blocks: [
          {
            type: "p",
            text: "Alerts fire on three trigger types: premium above a threshold you set, a new listing appearing in the registry, or a whale-sized trade on a ticker you're watching.",
          },
          {
            type: "p",
            text: "Deliveries land either as a web notification inside the workspace, or on Telegram once you link a chat from the Alerts tab — both read from the same subscription, so you don't configure each channel separately.",
          },
        ],
      },
    ],
  },
  {
    id: "risk",
    title: "Risk & disclaimers",
    pages: [
      {
        slug: "disclaimer",
        title: "Standing disclaimer",
        summary: "The same notice shown on every asset and trade page.",
        blocks: [
          {
            type: "callout",
            tone: "warn",
            text: "This is not investment advice. A tokenized stock, ETF or other real-world-asset token is a claim issued by a third party (see its issuer) that tracks the price of the underlying asset — it is not the underlying security itself, does not carry shareholder rights unless the issuer says otherwise, and can trade at a premium or discount to the real asset. Auevo does not issue, custody, or guarantee any of these tokens; verify an issuer's own terms and backing disclosures before trading.",
          },
          {
            type: "h2",
            text: "What Auevo verifies, and what it doesn't",
          },
          {
            type: "list",
              items: [
              "Verifies: a token's on-chain address is genuinely published by its stated issuer or appears in a chain's own registry, before it's shown as verified",
              "Verifies: contract capabilities a risk score is built from (mint, pause, blacklist, freeze, force-transfer, upgradeability) directly from the deployed bytecode",
              "Does not verify: an issuer's off-chain solvency, custody arrangements, or that its backing claims are accurate",
              "Does not verify: that a DEX pool's liquidity is sufficient for a given trade size — always check depth before a large order",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    pages: [
      {
        slug: "faq",
        title: "Frequently asked questions",
        summary: "Quick answers, each grounded in how Auevo actually works.",
        blocks: [
          { type: "h2", text: "Is Auevo custodial?" },
          { type: "p", text: "No. Every trade is a wallet signature you approve; Auevo never holds your funds." },
          { type: "h2", text: "Which chain does Auevo trade on natively?" },
          { type: "p", text: "Robinhood Chain — an EVM L2. Five other chains (Ethereum, Base, BNB Smart Chain, Arbitrum One, HyperEVM) are supported as bridge sources via LI.FI." },
          { type: "h2", text: "What is USDG?" },
          { type: "p", text: "USDG is Paxos's stablecoin — the quote asset every RWA/USDG pool on Robinhood Chain trades against." },
          { type: "h2", text: "Does Auevo run its own lending or index-fund contracts?" },
          { type: "p", text: "No. Lend reads Kamino's own market; index-style baskets would read a protocol like Reserve's DTFs once one deploys on Robinhood Chain — Auevo doesn't operate either kind of contract itself." },
          { type: "h2", text: "Why is a token I expect not listed?" },
          { type: "p", text: "The registry only lists a token once it's verified against a real source (an issuer's own list or a chain's own contract data) for a ticker already in Auevo's underlying catalog. A missing token means one of those two things hasn't happened yet, not that it was excluded on purpose." },
          { type: "h2", text: "Where are the Proof Protocol docs for agents?" },
          { type: "p", text: "A separate reference, at /docs — the Proof Protocol is Auevo's other product (AI-agent reputation, not RWA trading) and keeps its own docs tree." },
        ],
      },
    ],
  },
];

export function allDocPages(): { section: DocSection; page: DocPage }[] {
  return DOC_SECTIONS.flatMap((section) => section.pages.map((page) => ({ section, page })));
}

export function findDocPage(slug: string): { section: DocSection; page: DocPage } | null {
  return allDocPages().find(({ page }) => page.slug === slug) ?? null;
}
