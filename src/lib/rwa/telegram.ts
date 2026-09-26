/**
 * Telegram Bot API — RWA_SPEC.md Phase 8's Telegram alert delivery.
 * Webhook-based, not long-polling: Telegram POSTs each update to a URL
 * this app registers via setWebhook, which is the documented pattern for
 * a serverless app with no persistent process (core.telegram.org/bots/api)
 * — confirmed directly against Telegram's own docs before building this,
 * not assumed.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

export async function sendTelegramMessage(chatId: number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}
