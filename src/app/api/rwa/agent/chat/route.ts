import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { buildDocsCorpus } from "@/lib/docs-corpus";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same reasoning as the wallet agent (api/wallet/agent/chat): read-only,
// no tool access, doesn't need Opus-tier reasoning for Q&A grounded in a
// fixed corpus.
const MODEL = "claude-haiku-4-5";
const MAX_HISTORY = 20;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

let cachedSystemBase: string | null = null;
function systemBase(): string {
  if (cachedSystemBase) return cachedSystemBase;
  const corpus = buildDocsCorpus();
  cachedSystemBase = [
    "You are the AUEVO concierge, an AI guide embedded in the Auevo RWA trading app.",
    "Reply in the same language as the user's latest message, unless they ask for another language.",
    "Your job: explain any asset, risk score, fee, or feature on this platform in plain language, help someone figure out which basket or feature fits what they're trying to do, and walk a first-time user through a feature step by step.",
    "You have NO tool access, cannot place a trade, move funds, connect a wallet, or take any on-chain action yourself -- you can only explain and point the user to the right page in the app (e.g. /app/baskets, /app/pools, /app/lend) where they take the action themselves with their own signature. If asked to do something on-chain, say so plainly.",
    "Your knowledge of this platform is the corpus below -- grounded in the app's own real content, not general crypto knowledge. Never invent a specific price, APR, risk score, or balance: those are live numbers only the app's own pages show, and change constantly. Point the user to the live page for any current number instead of guessing one.",
    "This is a chat bubble, not a report: keep replies short -- a few sentences for a simple question, rarely more than a short paragraph plus a small list for a detailed one. Lead with the answer, skip preamble.",
    "Keep formatting plain -- short paragraphs and simple '- item' lines for lists. No markdown tables, no headers.",
    "\n\n--- AUEVO platform knowledge ---\n\n" + corpus,
  ].join(" ");
  return cachedSystemBase;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Concierge is not configured on the server" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const rawMessages = Array.isArray(body?.messages) ? body.messages : null;
  if (!rawMessages || rawMessages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }
  const messages: ChatMessage[] = rawMessages
    .filter((m: unknown): m is ChatMessage => {
      const mm = m as Record<string, unknown>;
      return (mm?.role === "user" || mm?.role === "assistant") && typeof mm?.content === "string" && mm.content.trim().length > 0;
    })
    .slice(-MAX_HISTORY);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
  }

  try {
    const allowed = await checkRateLimit(`rwa-concierge:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!allowed) return NextResponse.json({ error: "Too many messages — please wait a bit before trying again." }, { status: 429 });
  } catch (err) {
    console.error("rwa-concierge rate limit check failed", err);
  }

  const anthropic = new Anthropic({ apiKey });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const anthropicStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          system: systemBase(),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Concierge error";
        controller.enqueue(encoder.encode(`\n\n[error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
