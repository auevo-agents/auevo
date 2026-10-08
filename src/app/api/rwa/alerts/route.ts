import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSupabaseServer } from "@/lib/supabase";
import type { AlertType, AlertChannel } from "@/lib/rwa/alerts";

export const maxDuration = 15;

const VALID_TYPES: AlertType[] = ["premium", "listing", "whale", "price"];
const VALID_CHANNELS: AlertChannel[] = ["web", "telegram"];

function validateParams(type: AlertType, params: Record<string, unknown>): string | null {
  if (type === "premium") {
    if (typeof params.ticker !== "string" || !params.ticker) return "premium alert needs params.ticker";
    if (typeof params.thresholdBps !== "number" || params.thresholdBps <= 0) return "premium alert needs a positive params.thresholdBps";
  }
  if (type === "whale") {
    if (typeof params.ticker !== "string" || !params.ticker) return "whale alert needs params.ticker";
    if (typeof params.minUsd !== "number" || params.minUsd <= 0) return "whale alert needs a positive params.minUsd";
  }
  if (type === "listing" && params.ticker !== undefined && typeof params.ticker !== "string") {
    return "listing alert's params.ticker, if given, must be a string";
  }
  return null;
}

/** RWA_SPEC.md Phase 8's alert subscriptions — "subscribe to premium > X, a new ticker listing, a large trade". */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ indexed: false, alerts: [] });

  const account = req.nextUrl.searchParams.get("account");
  if (!account || !isAddress(account, { strict: false })) {
    return NextResponse.json({ error: "account must be a valid address" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("alerts")
    .select("id, type, params, channel, created_at")
    .eq("account", account.toLowerCase())
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: `Could not read alerts: ${error.message}` }, { status: 500 });

  return NextResponse.json({ indexed: true, alerts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  let body: { account?: string; type?: string; params?: Record<string, unknown>; channel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { account, type, params, channel } = body;
  if (!account || !isAddress(account, { strict: false })) {
    return NextResponse.json({ error: "account must be a valid address" }, { status: 400 });
  }
  if (!type || !VALID_TYPES.includes(type as AlertType)) {
    return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }
  const resolvedChannel = channel ?? "web";
  if (!VALID_CHANNELS.includes(resolvedChannel as AlertChannel)) {
    return NextResponse.json({ error: `channel must be one of ${VALID_CHANNELS.join(", ")}` }, { status: 400 });
  }
  const paramsError = validateParams(type as AlertType, params ?? {});
  if (paramsError) return NextResponse.json({ error: paramsError }, { status: 400 });

  if (resolvedChannel === "telegram") {
    const { data: link } = await supabase.from("telegram_links").select("chat_id").eq("account", account.toLowerCase()).maybeSingle();
    if (!link?.chat_id) {
      return NextResponse.json({ error: "Link a Telegram chat first (see /api/rwa/alerts/telegram-link)" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("alerts")
    .insert({ account: account.toLowerCase(), type, params: params ?? {}, channel: resolvedChannel })
    .select("id, type, params, channel, created_at")
    .single();
  if (error) return NextResponse.json({ error: `Could not create alert: ${error.message}` }, { status: 500 });

  return NextResponse.json({ alert: data }, { status: 201 });
}
