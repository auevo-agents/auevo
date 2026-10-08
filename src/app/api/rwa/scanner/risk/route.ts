import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 15;

/**
 * RWA_SPEC.md Phase 5's Risk scanner tab — reads whatever the
 * api/cron/rwa-risk pass (src/lib/rwa/run-risk.ts) has already scored into
 * rwa_risk, joined with ticker/issuer/symbol for display. A token with no
 * row yet (cron hasn't reached it) is shown with score=null rather than a
 * guessed number — same "never fake a number" posture as reference price.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, rows: [] });

  const { data: tokens, error: tokensError } = await supabase
    .from("rwa_tokens")
    .select("chain_id, address, underlying_ticker, issuer_id, symbol")
    .eq("verified", true);
  if (tokensError) return NextResponse.json({ error: `Could not read rwa_tokens: ${tokensError.message}` }, { status: 500 });
  if (!tokens || tokens.length === 0) return NextResponse.json({ indexed: true, rows: [] });

  const { data: risk, error: riskError } = await supabase
    .from("rwa_risk")
    .select("chain_id, token_address, admin_address, upgradeable, can_pause, can_blacklist, can_force_transfer, can_burn_others, mint_role_holders, score, checked_at, raw");
  if (riskError) return NextResponse.json({ error: `Could not read rwa_risk: ${riskError.message}` }, { status: 500 });

  const tickers = [...new Set(tokens.map((t) => t.underlying_ticker))];
  const { data: underlyings, error: underlyingsError } = tickers.length
    ? await supabase.from("rwa_underlyings").select("ticker, name").in("ticker", tickers)
    : { data: [], error: null };
  if (underlyingsError) return NextResponse.json({ error: `Could not read rwa_underlyings: ${underlyingsError.message}` }, { status: 500 });

  const nameByTicker = new Map((underlyings ?? []).map((u) => [u.ticker, u.name]));
  const riskByKey = new Map((risk ?? []).map((r) => [`${r.chain_id}:${r.token_address.toLowerCase()}`, r]));

  const rows = tokens.map((t) => {
    const r = riskByKey.get(`${t.chain_id}:${t.address.toLowerCase()}`);
    const raw = r?.raw as { canMint?: boolean; canFreeze?: boolean } | undefined;
    return {
      ticker: t.underlying_ticker,
      name: nameByTicker.get(t.underlying_ticker) ?? t.underlying_ticker,
      chainId: t.chain_id,
      address: t.address,
      issuerId: t.issuer_id,
      symbol: t.symbol,
      score: r?.score ?? null,
      adminAddress: r?.admin_address ?? null,
      upgradeable: r?.upgradeable ?? null,
      canMint: raw?.canMint ?? null,
      canPause: r?.can_pause ?? null,
      canBlacklist: r?.can_blacklist ?? null,
      canFreeze: raw?.canFreeze ?? null,
      canForceTransfer: r?.can_force_transfer ?? null,
      canBurnOthers: r?.can_burn_others ?? null,
      mintRoleHolders: r?.mint_role_holders ?? null,
      checkedAt: r?.checked_at ?? null,
    };
  });

  // Lowest score (most issuer intervention power) first — the whole point of a risk tab is surfacing what needs a closer look.
  rows.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return a.score - b.score;
  });

  return NextResponse.json({ indexed: true, rows });
}
