import { ADDRESS_TO_BOT, BOT_FEE_REGISTRY } from "./bot-fees";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const LOOKBACK_DAYS = 90;
const LAMPORTS_PER_SOL = 1_000_000_000;

interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // lamports
}

interface HeliusInstruction {
  programId: string;
  innerInstructions?: { programId: string }[];
}

interface HeliusTransaction {
  signature: string;
  timestamp: number; // unix seconds
  nativeTransfers?: HeliusNativeTransfer[];
  instructions?: HeliusInstruction[];
}

/** All program IDs touched by a tx, top-level and inner instructions. */
function programIdsIn(tx: HeliusTransaction): Set<string> {
  const ids = new Set<string>();
  for (const ix of tx.instructions ?? []) {
    ids.add(ix.programId);
    for (const inner of ix.innerInstructions ?? []) {
      ids.add(inner.programId);
    }
  }
  return ids;
}

export interface BotBreakdownEntry {
  botKey: string;
  name: string;
  solPaid: number;
  usdPaid: number;
  txCount: number;
}

export interface ScanResult {
  wallet: string;
  /** Chain this scan covered — always "solana" in v1, kept explicit for when more chains are added */
  chain: "solana";
  daysScanned: number;
  totalTxScanned: number;
  totalSol: number;
  totalUsd: number;
  totalBotTrades: number;
  breakdown: BotBreakdownEntry[];
  solPriceUsd: number;
  /** Bots we could not check because they don't use a fixed fee wallet (see docs) */
  unsupportedBots: string[];
  warnings: string[];
}

async function fetchSolPriceUsd(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    const json = await res.json();
    return json?.solana?.usd ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Pull up to `LOOKBACK_DAYS` of transaction history for a wallet via Helius
 * Enhanced Transactions API, paginating backwards by signature.
 */
async function fetchWalletHistory(wallet: string): Promise<HeliusTransaction[]> {
  if (!HELIUS_API_KEY) {
    throw new Error(
      "HELIUS_API_KEY is not set. Get a free key at helius.dev and add it to .env.local"
    );
  }

  const cutoff = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 24 * 60 * 60;
  const all: HeliusTransaction[] = [];
  let before: string | undefined;
  const MAX_PAGES = 20; // ~2000 tx safety cap for v1

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(
      `https://api.helius.xyz/v0/addresses/${wallet}/transactions`
    );
    url.searchParams.set("api-key", HELIUS_API_KEY);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Helius API error: ${res.status} ${await res.text()}`);
    }
    const batch: HeliusTransaction[] = await res.json();
    if (batch.length === 0) break;

    all.push(...batch);
    const oldest = batch[batch.length - 1];
    if (oldest.timestamp < cutoff) break;
    before = oldest.signature;
  }

  return all.filter((tx) => tx.timestamp >= cutoff);
}

export async function scanWallet(wallet: string): Promise<ScanResult> {
  const warnings: string[] = [];
  const [txs, solPriceUsd] = await Promise.all([
    fetchWalletHistory(wallet),
    fetchSolPriceUsd(),
  ]);

  const perBot: Record<string, { solPaid: number; txCount: number }> = {};

  const programOnlyBots = Object.entries(BOT_FEE_REGISTRY).filter(
    ([, bot]) => bot.programOnly && bot.programIds?.length
  );

  for (const tx of txs) {
    let txProgramIds: Set<string> | null = null; // computed lazily, only if needed

    // Pass 1: bots with a known fixed fee-wallet address.
    for (const transfer of tx.nativeTransfers ?? []) {
      if (transfer.fromUserAccount !== wallet) continue;
      const botKey = ADDRESS_TO_BOT[transfer.toUserAccount];
      if (!botKey) continue;

      const bot = BOT_FEE_REGISTRY[botKey];
      if (bot.programIds?.length) {
        txProgramIds ??= programIdsIn(tx);
        if (!bot.programIds.some((id) => txProgramIds!.has(id))) continue; // transfer unrelated to this bot's program(s)
      }

      if (!perBot[botKey]) perBot[botKey] = { solPaid: 0, txCount: 0 };
      perBot[botKey].solPaid += transfer.amount / LAMPORTS_PER_SOL;
      perBot[botKey].txCount += 1;
    }

    // Pass 2: bots whose fee address changes per trade/isn't fully known
    // (Axiom, Photon, GMGN, Trojan) — sum every native SOL transfer OUT of
    // the wallet in a tx touching one of their programs, as long as it
    // wasn't already claimed by an address-based match above.
    for (const [botKey, bot] of programOnlyBots) {
      txProgramIds ??= programIdsIn(tx);
      if (!bot.programIds!.some((id) => txProgramIds!.has(id))) continue;

      let sol = 0;
      let matched = false;
      for (const transfer of tx.nativeTransfers ?? []) {
        if (transfer.fromUserAccount !== wallet) continue;
        if (ADDRESS_TO_BOT[transfer.toUserAccount]) continue; // already counted elsewhere
        sol += transfer.amount / LAMPORTS_PER_SOL;
        matched = true;
      }

      if (matched) {
        if (!perBot[botKey]) perBot[botKey] = { solPaid: 0, txCount: 0 };
        perBot[botKey].solPaid += sol;
        perBot[botKey].txCount += 1;
      }
    }
  }

  const breakdown: BotBreakdownEntry[] = Object.entries(perBot)
    .map(([botKey, v]) => ({
      botKey,
      name: BOT_FEE_REGISTRY[botKey].name,
      solPaid: v.solPaid,
      usdPaid: v.solPaid * solPriceUsd,
      txCount: v.txCount,
    }))
    .sort((a, b) => b.usdPaid - a.usdPaid);

  const totalSol = breakdown.reduce((s, b) => s + b.solPaid, 0);
  const totalBotTrades = breakdown.reduce((s, b) => s + b.txCount, 0);

  if (txs.length === 0) {
    warnings.push("No transactions found for this wallet in the lookback window.");
  }

  return {
    wallet,
    chain: "solana",
    daysScanned: LOOKBACK_DAYS,
    totalTxScanned: txs.length,
    totalSol,
    totalUsd: totalSol * solPriceUsd,
    totalBotTrades,
    breakdown,
    solPriceUsd,
    unsupportedBots: ["BullX"],
    warnings,
  };
}
