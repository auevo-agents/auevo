"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy, useSendTransaction, useFundWallet } from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { encodeFunctionData, erc20Abi, parseEther, parseUnits } from "viem";
import styles from "./wallet.module.css";
import { fetchWalletBalances, type WalletBalance } from "@/lib/wallet/balances";
import { USDC_ADDRESS, WALLET_CHAINS } from "@/lib/wallet/tokens";
import { walletFetch, walletFetchJson } from "@/lib/wallet/api-client";

type Chat = { id: string; agent_id: string | null; title: string | null };
type Agent = { id: string; name: string; persona: string };
type Message = { id: string; role: "user" | "assistant"; content: string };

const NETWORKS = WALLET_CHAINS.map((c) => ({ id: c.id, label: c.name }));

export default function WalletPage() {
  // Guards calling usePrivy() below: WalletProviders only mounts
  // PrivyProvider when this env var is set (see providers.tsx), so
  // calling the hook without it throws — not caught by anything, which
  // is what was rendering this page as a blank screen in production
  // before this check existed. NEXT_PUBLIC_-prefixed vars are inlined at
  // build time, so this reads identically on the server and the client.
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <Shell>
        <div className={styles.loginGate}>
          <h1>AUEVO Wallet</h1>
          <p>Not configured yet — NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET need to be set for this environment.</p>
        </div>
      </Shell>
    );
  }
  return <PrivyGate />;
}

function PrivyGate() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const address = user?.wallet?.address as `0x${string}` | undefined;

  if (!ready) return <Shell><div className={styles.emptyState}>Loading…</div></Shell>;
  if (!authenticated || !address) return <LoginGate onLogin={login} />;

  return <WalletApp address={address} onLogout={logout} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.walletRoot}>
      <div className={styles.spaceBg} />
      {children}
    </div>
  );
}

function LoginGate({ onLogin }: { onLogin: () => void }) {
  return (
    <Shell>
      <div className={styles.loginGate}>
        <h1>AUEVO Wallet</h1>
        <p>Sign in with email, phone or X. No seed phrase to write down — you can always recover access the same way.</p>
        <button className={styles.loginBtn} onClick={onLogin}>
          Sign up / Login
        </button>
      </div>
    </Shell>
  );
}

function WalletApp({ address, onLogout }: { address: `0x${string}`; onLogout: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"chats" | "agents">("chats");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const profileSynced = useRef(false);
  useEffect(() => {
    if (profileSynced.current) return;
    profileSynced.current = true;
    walletFetch("/api/wallet/profile", { method: "PATCH", body: JSON.stringify({}) }).catch(() => {});
  }, []);

  const balancesQuery = useQuery({
    queryKey: ["wallet-balances", address],
    queryFn: () => fetchWalletBalances(address),
    refetchInterval: 30_000,
  });

  const chatsQuery = useQuery({
    queryKey: ["wallet-chats"],
    queryFn: () => walletFetchJson<Chat[]>("/api/wallet/chats"),
  });

  const agentsQuery = useQuery({
    queryKey: ["wallet-agents"],
    queryFn: () => walletFetchJson<Agent[]>("/api/wallet/agents"),
  });

  // Derived, not stored: defaults to the most recent chat until the user
  // explicitly picks one or a new chat is created (both of which do set
  // selectedChatId). Avoids setting state from inside an effect just to
  // mirror query data that's already available synchronously.
  const effectiveChatId = selectedChatId ?? chatsQuery.data?.[0]?.id ?? null;

  const messagesQuery = useQuery({
    queryKey: ["wallet-messages", effectiveChatId],
    queryFn: () => walletFetchJson<Message[]>(`/api/wallet/chats/${effectiveChatId}/messages`),
    enabled: !!effectiveChatId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data, streamingText]);

  async function newChat() {
    const chat = await walletFetchJson<Chat>("/api/wallet/chats", { method: "POST", body: JSON.stringify({}) });
    await qc.invalidateQueries({ queryKey: ["wallet-chats"] });
    setSelectedChatId(chat.id);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    let chatId = effectiveChatId;
    if (!chatId) {
      const chat = await walletFetchJson<Chat>("/api/wallet/chats", { method: "POST", body: JSON.stringify({}) });
      await qc.invalidateQueries({ queryKey: ["wallet-chats"] });
      chatId = chat.id;
      setSelectedChatId(chatId);
    }
    setInput("");
    setStreamingText("");

    const walletContext = {
      address,
      balances: (balancesQuery.data ?? []).map((b) => ({ chain: b.chainName, symbol: b.symbol, amount: b.formatted })),
    };

    const res = await walletFetch("/api/wallet/agent/chat", {
      method: "POST",
      body: JSON.stringify({ chatId, message: text, walletContext }),
    });
    if (!res.body) {
      setStreamingText(null);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      setStreamingText(full);
    }
    setStreamingText(null);
    await qc.invalidateQueries({ queryKey: ["wallet-messages", chatId] });
  }

  return (
    <Shell>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/logos/auevo.png" alt="" />
          AUEVO
        </div>

        <div className={styles.navList}>
          <button className={tab === "chats" ? styles.navItemActive : styles.navItem} onClick={() => setTab("chats")}>
            💬 Chats
          </button>
          <button className={tab === "agents" ? styles.navItemActive : styles.navItem} onClick={() => setTab("agents")}>
            ✦ Agents
          </button>
        </div>

        {tab === "chats" && (
          <>
            <div className={styles.chatListLabel}>
              <span>RECENT CHATS</span>
              <button onClick={newChat} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
                +
              </button>
            </div>
            <div className={styles.chatList}>
              {(chatsQuery.data ?? []).length === 0 && <span className={styles.chatListLabel}>Start a conversation.</span>}
              {(chatsQuery.data ?? []).map((c) => (
                <button
                  key={c.id}
                  className={c.id === effectiveChatId ? styles.chatListItemActive : styles.chatListItem}
                  onClick={() => setSelectedChatId(c.id)}
                >
                  {c.title ?? "New chat"}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "agents" && <AgentsPanel agents={agentsQuery.data ?? []} onCreated={() => qc.invalidateQueries({ queryKey: ["wallet-agents"] })} />}

        <div className={styles.sidebarFooter}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            Log out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.messages}>
          {(messagesQuery.data ?? []).length === 0 && !streamingText && (
            <div className={styles.emptyState}>
              <p>Ask about your balances, or anything else. This agent can only read what you see here — it can&apos;t send transactions.</p>
            </div>
          )}
          {(messagesQuery.data ?? []).map((m) => (
            <div key={m.id} className={m.role === "user" ? styles.msgRowUser : styles.msgRow}>
              <div className={m.role === "user" ? styles.msgBubbleUser : styles.msgBubble}>{m.content}</div>
            </div>
          ))}
          {streamingText !== null && (
            <div className={styles.msgRow}>
              <div className={styles.msgBubble}>{streamingText || "…"}</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <input
            className={styles.composerInput}
            placeholder="Message AUEVO Wallet…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className={styles.sendBtn} disabled={!input.trim() || streamingText !== null}>
            ↑
          </button>
        </form>
      </main>

      <WalletPanel
        address={address}
        balances={balancesQuery.data ?? []}
        loading={balancesQuery.isLoading}
        onSend={() => setShowSend(true)}
        onReceive={() => setShowReceive(true)}
      />

      {showSend && <SendModal onClose={() => setShowSend(false)} />}
      {showReceive && <ReceiveModal address={address} onClose={() => setShowReceive(false)} />}
    </Shell>
  );
}

function AgentsPanel({ agents, onCreated }: { agents: Agent[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await walletFetchJson("/api/wallet/agents", { method: "POST", body: JSON.stringify({ name, persona }) });
      setName("");
      setPersona("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.chatList}>
      {agents.map((a) => (
        <div key={a.id} className={styles.chatListItem}>
          {a.name}
        </div>
      ))}
      <input
        className={styles.fieldInput}
        placeholder="Agent name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginTop: 8 }}
      />
      <textarea
        className={styles.fieldInput}
        placeholder="Persona / instructions (optional)"
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        rows={3}
        style={{ marginTop: 6 }}
      />
      <button className={styles.primaryBtn} style={{ marginTop: 6 }} onClick={create} disabled={busy || !name.trim()}>
        Create agent
      </button>
    </div>
  );
}

function WalletPanel({
  address,
  balances,
  loading,
  onSend,
  onReceive,
}: {
  address: string;
  balances: WalletBalance[];
  loading: boolean;
  onSend: () => void;
  onReceive: () => void;
}) {
  const [tab, setTab] = useState<"assets" | "activity">("assets");
  const { fundWallet } = useFundWallet();

  const usdcTotal = balances.filter((b) => b.symbol === "USDC").reduce((sum, b) => sum + Number(b.formatted), 0);

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>My wallet</span>
      </div>
      <div className={styles.address}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </div>

      <div>
        <div className={styles.balanceLabel}>USDC BALANCE (all chains)</div>
        <div className={styles.balanceValue}>${usdcTotal.toFixed(2)}</div>
        <div className={styles.hint}>ETH shown below in ETH — no price feed wired up yet, so it&apos;s never converted to a guessed USD figure.</div>
      </div>

      <div className={styles.actionRow}>
        <button className={styles.actionBtn} onClick={onSend}>
          ↗<span>Send</span>
        </button>
        <button className={styles.actionBtn} disabled title="Coming soon">
          ⇄<span>Swap</span>
        </button>
        <button className={styles.actionBtn} onClick={onReceive}>
          ↓<span>Receive</span>
        </button>
        <button className={styles.actionBtn} onClick={() => fundWallet({ address })}>
          +<span>Buy</span>
        </button>
      </div>

      <div className={styles.tabRow}>
        <button className={tab === "assets" ? styles.tabBtnActive : styles.tabBtn} onClick={() => setTab("assets")}>
          Assets
        </button>
        <button className={tab === "activity" ? styles.tabBtnActive : styles.tabBtn} onClick={() => setTab("activity")}>
          Activity
        </button>
      </div>

      {tab === "assets" && (
        <div>
          {loading && <div className={styles.hint}>Loading balances…</div>}
          {!loading && balances.length === 0 && <div className={styles.hint}>No balances found on Ethereum or Base yet.</div>}
          {balances.map((b) => (
            <div className={styles.assetRow} key={`${b.chainId}-${b.symbol}`}>
              <div className={styles.assetLeft}>
                <img src="/logos/ethereum.svg" alt="" className={styles.assetIcon} />
                <div>
                  <div className={styles.assetName}>{b.symbol}</div>
                  <div className={styles.assetSub}>{b.chainName}</div>
                </div>
              </div>
              <div className={styles.assetValue}>{Number(b.formatted).toFixed(b.symbol === "ETH" ? 5 : 2)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "activity" && <div className={styles.hint}>Transaction history is coming — this reads from a chain indexer we haven&apos;t wired up for this wallet yet.</div>}
    </aside>
  );
}

function SendModal({ onClose }: { onClose: () => void }) {
  const { sendTransaction } = useSendTransaction();
  const [chainId, setChainId] = useState<number>(NETWORKS[0].id);
  const [asset, setAsset] = useState<"ETH" | "USDC">("ETH");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      setError("Enter a valid address");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("Enter an amount");
      return;
    }
    setBusy(true);
    try {
      if (asset === "ETH") {
        const value = parseEther(amount);
        await sendTransaction({ to, value: `0x${value.toString(16)}`, chainId });
      } else {
        const usdc = USDC_ADDRESS[chainId];
        const value = parseUnits(amount, 6);
        const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as `0x${string}`, value] });
        await sendTransaction({ to: usdc, data, chainId });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalEyebrow}>YOUR AUEVO WALLET</div>
            <div className={styles.modalTitle}>Send</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Network</label>
          <select className={styles.fieldInput} value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Asset</label>
          <select className={styles.fieldInput} value={asset} onChange={(e) => setAsset(e.target.value as "ETH" | "USDC")}>
            <option value="ETH">ETH</option>
            <option value="USDC">USDC</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Send to</label>
          <input className={styles.fieldInput} placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Amount</label>
          <input className={styles.fieldInput} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>

        {error && <div className={styles.errorText}>{error}</div>}

        <button className={styles.primaryBtn} onClick={submit} disabled={busy}>
          {busy ? "Sending…" : "Review send"}
        </button>
      </div>
    </div>
  );
}

function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [chainId, setChainId] = useState<number>(NETWORKS[0].id);
  const network = useMemo(() => NETWORKS.find((n) => n.id === chainId)!, [chainId]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalEyebrow}>YOUR AUEVO WALLET</div>
            <div className={styles.modalTitle}>Receive crypto</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Network</label>
          <select className={styles.fieldInput} value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.qrWrap}>
          <QRCodeSVG value={address} size={200} />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Your wallet address</label>
          <input className={styles.fieldInput} value={address} readOnly />
        </div>

        <button
          className={styles.primaryBtn}
          onClick={() => {
            navigator.clipboard?.writeText(address);
            onClose();
          }}
        >
          Copy address
        </button>

        <div className={styles.hint}>
          Send only assets on {network.label}. The same address exists on other networks too, but funds stay on whichever network you send them
          on.
        </div>
      </div>
    </div>
  );
}
