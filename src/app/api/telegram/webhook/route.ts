import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { sendTelegramMessage, type TelegramUpdate } from "@/lib/rwa/telegram";

export const maxDuration = 15;

/**
 * Telegram's webhook target — registered via setWebhook with a
 * secret_token, which Telegram echoes back on every delivery as the
 * X-Telegram-Bot-Api-Secret-Token header (core.telegram.org/bots/api's
 * own documented mechanism for verifying a webhook actually came from
 * Telegram, not a stranger who found this URL).
 *
 * The only command handled is `/start <code>`, the standard Telegram
 * bot deep-link pattern: a user gets `<code>` from
 * /api/rwa/alerts/telegram-link (their wallet is connected there, this
 * webhook has no idea what wallet is talking to it otherwise), sends it
 * to the bot, and this resolves it to that account's telegram_links row.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ ok: true }); // nothing to do without a database, but always 200 so Telegram doesn't retry forever

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const text = update.message?.text?.trim();
  const chatId = update.message?.chat.id;
  if (!text || !chatId) return NextResponse.json({ ok: true });

  const match = text.match(/^\/start\s+([a-f0-9]+)$/i);
  if (!match) {
    if (text.startsWith("/start")) {
      await sendTelegramMessage(chatId, "Open Auevo, go to the Scanner's Alerts tab, and tap “Link Telegram” to get your code.");
    }
    return NextResponse.json({ ok: true });
  }

  const code = match[1];
  const { data: link, error } = await supabase
    .from("telegram_links")
    .select("account, link_code_expires_at")
    .eq("link_code", code)
    .maybeSingle();
  if (error || !link) {
    await sendTelegramMessage(chatId, "That code wasn't recognized — generate a new one from Auevo and try again.");
    return NextResponse.json({ ok: true });
  }
  if (!link.link_code_expires_at || new Date(link.link_code_expires_at) < new Date()) {
    await sendTelegramMessage(chatId, "That code expired — generate a new one from Auevo and try again.");
    return NextResponse.json({ ok: true });
  }

  await supabase
    .from("telegram_links")
    .update({ chat_id: chatId, link_code: null, link_code_expires_at: null, linked_at: new Date().toISOString() })
    .eq("account", link.account);

  await sendTelegramMessage(chatId, "Linked! You'll get alerts here for anything you subscribe to on Auevo with the Telegram channel.");
  return NextResponse.json({ ok: true });
}
