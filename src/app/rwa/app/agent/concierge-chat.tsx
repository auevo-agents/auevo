"use client";

import { useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTER: ChatMessage = {
  role: "assistant",
  content: "Hi — I'm the AUEVO concierge. Ask me about any asset, risk score, basket, or how a feature works, and I'll explain it in plain language.",
};

/**
 * Real chat, not illustrative copy: streams from /api/rwa/agent/chat
 * (Claude Haiku 4.5, grounded in the same content as /docs, no tool
 * access). History lives only in this component's state — no account
 * system on the RWA app to persist it against, and nothing here needs
 * to survive a refresh.
 */
export function ConciergeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([STARTER]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setStreaming("");

    try {
      const res = await fetch("/api/rwa/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "The concierge is unavailable right now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStreaming(full);
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      }
      setMessages((m) => [...m, { role: "assistant", content: full || "(no response)" }]);
      setStreaming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStreaming(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-preview-card">
      <div className="agent-preview-header">
        <span className="agent-preview-dot" />
        <b>AUEVO AI</b>
        <span className="agent-preview-status">online</span>
      </div>

      <div className="agent-preview-chat" ref={listRef} style={{ maxHeight: 420, overflowY: "auto" }}>
        {messages.map((m, i) => (
          <div key={i} className={`agent-chat-row ${m.role === "user" ? "agent-chat-user" : "agent-chat-bot"}`}>
            <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
          </div>
        ))}
        {streaming !== null && (
          <div className="agent-chat-row agent-chat-bot">
            <span style={{ whiteSpace: "pre-wrap" }}>{streaming || "…"}</span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "0 20px 12px", fontSize: 12.5, color: "var(--red, #e5484d)" }}>{error}</div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{ display: "flex", gap: 8, padding: "14px 18px", borderTop: "1px solid var(--line)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about an asset, a basket, or how something works…"
          disabled={busy}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid var(--line)",
            background: "var(--panel-2)",
            color: "var(--ink, #f2f4f3)",
            fontSize: 13.5,
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            border: "1px solid rgba(201,178,124,.35)",
            background: busy ? "var(--panel-2)" : "rgba(201,178,124,.14)",
            color: "var(--au-gold, #c9b27c)",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: busy || !input.trim() ? "default" : "pointer",
          }}
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
