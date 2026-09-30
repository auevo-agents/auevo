import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { PrivyAuthError, requirePrivyUserId } from "@/lib/wallet/privy-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-5";

/**
 * The wallet agent's only job is to talk about what it's shown — it has no
 * tool access and cannot call Anthropic with anything that could send a
 * transaction. Per HANDOFF.md: "агент только читает данные". The
 * `walletContext` block below is client-supplied (the browser already has
 * the user's own balances from a public RPC read), not fetched by this
 * route — so there is nothing here for a prompt-injected message to
 * escalate into: this route can talk, never act.
 */
function buildSystemPrompt(persona: string | null, walletContext: unknown): string {
  const base = [
    "You are the AUEVO Wallet assistant, an AI agent embedded in a self-custodial crypto wallet.",
    "Always write your replies in English. Do not switch to Russian or use Cyrillic, even when the persona, chat history, wallet context, or the user's message contains another language. Keep ticker symbols, contract addresses, and numbers exactly as supplied.",
    "You can see the user's wallet balances (given to you below) and discuss them, explain concepts, and help the user understand their portfolio.",
    "You cannot send transactions, sign anything, or take any action — you have no tools and no wallet access. If asked to do something on-chain, explain that you can only inform, and the user needs to use Send/Swap/Buy in the app themselves.",
    "Never invent a balance, price, or transaction you were not given. If you don't have the data, say so.",
    "This is a chat bubble in a phone-sized panel, not a report: keep replies short — a few sentences for a simple question, and even a detailed answer should rarely run past a short paragraph plus a small list or table. Lead with the answer, skip preamble and disclaimers the user didn't ask for.",
    "Format with lightweight markdown so it renders nicely: **bold** for a key figure or word, a short bullet list (- item) for a few distinct points, a small pipe table only when comparing rows of numbers (e.g. balances per chain), and ## only for a genuinely separate section — not on a two-sentence reply.",
  ].join(" ");
  const personaLine = persona?.trim() ? `\n\nYour configured persona: ${persona.trim()}` : "";
  const context = walletContext ? `\n\nCurrent wallet context (read-only, given by the client):\n${JSON.stringify(walletContext)}` : "";
  return base + personaLine + context;
}

export async function POST(req: Request) {
  let privyUserId: string;
  try {
    privyUserId = await requirePrivyUserId(req);
  } catch (err) {
    if (err instanceof PrivyAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Agent chat is not configured on the server" }, { status: 503 });

  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured on the server" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const chatId = typeof body?.chatId === "string" ? body.chatId : null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const walletContext = body?.walletContext ?? null;
  if (!chatId || !message) {
    return NextResponse.json({ error: "chatId and message are required" }, { status: 400 });
  }

  const { data: chat, error: chatErr } = await supabase
    .from("wallet_chats")
    .select("id, agent_id")
    .eq("id", chatId)
    .eq("privy_user_id", privyUserId)
    .maybeSingle();
  if (chatErr) return NextResponse.json({ error: chatErr.message }, { status: 500 });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

  let persona: string | null = null;
  if (chat.agent_id) {
    const { data: agent } = await supabase.from("wallet_agents").select("persona").eq("id", chat.agent_id).maybeSingle();
    persona = agent?.persona ?? null;
  }

  const { data: history, error: historyErr } = await supabase
    .from("wallet_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(40);
  if (historyErr) return NextResponse.json({ error: historyErr.message }, { status: 500 });

  const { error: insertUserErr } = await supabase
    .from("wallet_messages")
    .insert({ chat_id: chatId, role: "user", content: message });
  if (insertUserErr) return NextResponse.json({ error: insertUserErr.message }, { status: 500 });

  const anthropic = new Anthropic({ apiKey });
  const system = buildSystemPrompt(persona, walletContext);
  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((m): Anthropic.MessageParam => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        const anthropicStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          system,
          messages,
        });
        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Agent error";
        controller.enqueue(encoder.encode(`\n\n[error: ${msg}]`));
      } finally {
        // Persist BEFORE close(): close() is what makes the client's
        // reader.read() resolve with done:true, which the client treats as
        // "safe to invalidate the messages query now". Closing first meant
        // the client could refetch before this insert had landed, getting
        // back a list that didn't include the reply it just streamed —
        // the reply would flash and then disappear.
        if (full) {
          await supabase
            .from("wallet_messages")
            .insert({ chat_id: chatId, role: "assistant", content: full });
          await supabase.from("wallet_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
