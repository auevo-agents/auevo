import type { Address } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { robinhoodChain } from "@/lib/chains";
import type { KnownV4Pool } from "./quote";

/**
 * The real (fee, tickSpacing, hooks) triples this app has already
 * discovered on-chain for Robinhood Chain's v4 pools — see quote.ts's own
 * doc comment on KnownV4Pool for why quote.ts can't guess these from a
 * fixed tier list alone. A small table (a handful of RWA pools), so this
 * is a cheap, unfiltered read rather than something worth narrowing to a
 * specific pair server-side.
 */
export async function fetchKnownV4Pools(supabase: SupabaseClient | null): Promise<KnownV4Pool[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("rwa_pools")
    .select("token0, token1, fee, tick_spacing, hooks")
    .eq("chain_id", robinhoodChain.id)
    .eq("dex", "uniswap_v4");

  if (error || !data) return [];

  return data.map((p) => ({
    token0: p.token0 as Address,
    token1: p.token1 as Address,
    fee: p.fee as number,
    tickSpacing: p.tick_spacing as number,
    hooks: p.hooks as Address,
  }));
}
