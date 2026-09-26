import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 15;

const LINK_CODE_TTL_MS = 15 * 60 * 1000;

/**
 * Step 1 of linking a wallet to a Telegram chat for alert delivery — the
 * account generates a one-time code here, then sends `/start <code>` to
 * the bot; the webhook (api/telegram/webhook) resolves the code to this
 * account and records the chat_id. Standard Telegram bot deep-link
 * pattern (core.telegram.org/bots/api's own `/start` payload convention),
 * not something invented here.
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "Telegram bot not configured (TELEGRAM_BOT_TOKEN unset)" }, { status: 400 });
  }

  let body: { account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { account } = body;
  if (!account || !isAddress(account, { strict: false })) {
    return NextResponse.json({ error: "account must be a valid address" }, { status: 400 });
  }

  const code = randomBytes(6).toString("hex");
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();

  // Preserve an existing chat_id if this account is already linked and
  // is just generating a fresh code (e.g. to re-link a different chat) —
  // a plain upsert would otherwise null it out until the new code is used.
  const { data: existing } = await supabase.from("telegram_links").select("chat_id").eq("account", account.toLowerCase()).maybeSingle();

  const { error } = await supabase.from("telegram_links").upsert(
    { account: account.toLowerCase(), chat_id: existing?.chat_id ?? null, link_code: code, link_code_expires_at: expiresAt },
    { onConflict: "account" }
  );
  if (error) return NextResponse.json({ error: `Could not create a link code: ${error.message}` }, { status: 500 });

  return NextResponse.json({ code, expiresAt, botUsername: botUsername ?? null });
}
