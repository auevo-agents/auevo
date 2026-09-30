"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy, useSendTransaction, useFundWallet } from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { encodeFunctionData, erc20Abi, formatUnits, parseEther, parseUnits } from "viem";
import { AuevoMark } from "@/app/auevo-logo";
import styles from "./wallet.module.css";
import { fetchWalletBalances, publicClientForChain, type WalletBalance } from "@/lib/wallet/balances";
import { chainById, USDC_ADDRESS, USDC_DECIMALS, WALLET_CHAINS } from "@/lib/wallet/tokens";
import { walletFetch, walletFetchJson } from "@/lib/wallet/api-client";
import { ZEROX_NATIVE_TOKEN, type ZeroXQuote } from "@/lib/wallet/zerox";

type Chat = { id: string; agent_id: string | null; title: string | null };
type Agent = { id: string; name: string; persona: string; accent_color: string | null; emoji: string | null };
type Message = { id: string; role: "user" | "assistant"; content: string };

const NETWORKS = WALLET_CHAINS.map((c) => ({ id: c.id, label: c.name }));

/**
 * Ready-made assistant personalities — different mood, tone and accent
 * color, picked once per chat rather than being a single fixed voice.
 * Each preset is a regular wallet_agents row under the hood (created,
 * deduped by name, the first time a user picks it — see POST
 * /api/wallet/agents), so it flows through the exact same persona/accent
 * plumbing a user's own custom agent does.
 */
type Mood = "neutral" | "wise" | "excited" | "calm";

const PRESET_AGENTS: { name: string; role: string; persona: string; accent: string; emoji: string; mood: Mood }[] = [
  {
    name: "Navigator", role: "Market explorer",
    persona: "A thoughtful market navigator. Help discover assets and compare opportunities using only available verified information. Explain uncertainty plainly. Read-only: never claim to execute trades.",
    accent: "#54bdff", emoji: "✧",
    mood: "neutral",
  },
  {
    name: "Sentinel", role: "Risk guardian",
    persona: "A precise, vigilant risk analyst. Examine wallet exposure and explain relevant risks with evidence and limitations. Read-only: never claim to protect funds or execute transactions.",
    accent: "#78a6ff", emoji: "◇",
    mood: "wise",
  },
  {
    name: "Architect", role: "Portfolio strategist",
    persona: "A measured systems thinker. Break down portfolio structure and scenario tradeoffs in plain language, using only the data visible here. Read-only: never claim to rebalance funds.",
    accent: "#9dbbff", emoji: "⬡",
    mood: "calm",
  },
  {
    name: "Vanguard", role: "Fast briefing",
    persona: "An energetic but careful research scout. Give concise market briefings and highlight what needs checking next. Do not invent real-time facts. Read-only: never claim to place orders.",
    accent: "#5a8ff4", emoji: "↗",
    mood: "excited",
  },
  { name: "Oracle", role: "Data intelligence", persona: "A calm data analyst. Interpret on-chain and wallet information with context, caveats and transparent reasoning. Read-only: never claim to predict prices or move assets.", accent: "#a8d7ff", emoji: "✦", mood: "wise" },
  { name: "Nova", role: "Discovery scout", persona: "An adventurous but grounded guide to new listings and ecosystems. Separate verified facts from possibilities. Read-only: never claim to make transactions.", accent: "#4edbff", emoji: "✳", mood: "excited" },
  { name: "Astra", role: "Research companion", persona: "A patient researcher. Compare issuers, chains and asset details, explaining methodology and uncertainty. Read-only: never claim to execute trades.", accent: "#8dafff", emoji: "✧", mood: "calm" },
  { name: "Cipher", role: "On-chain analyst", persona: "A meticulous on-chain analyst. Trace patterns in the available wallet data and flag anomalies without speculation. Read-only: never claim to send transactions.", accent: "#56b4ff", emoji: "⌁", mood: "neutral" },
];

function AgentPortrait({ name, className = "", size = 36 }: { name: string; className?: string; size?: number }) {
  const index = PRESET_AGENTS.findIndex((agent) => agent.name === name);
  if (index < 0) return null;
  const x = (index % 4) * 100 / 3;
  const y = index < 4 ? 0 : 100;
  return <span className={`${styles.agentPortrait} ${className}`} role="img" aria-label={`${name} portrait`} style={{ backgroundPosition: `${x}% ${y}%`, width: size, height: size }} />;
}

/** Custom agents have no uploaded portrait yet; assign a stable character
 * from the existing eight so their welcome view still has a visual identity. */
function portraitForAgent(name?: string): string {
  if (!name) return PRESET_AGENTS[0].name;
  if (PRESET_AGENTS.some((agent) => agent.name === name)) return name;
  const index = Array.from(name).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % PRESET_AGENTS.length;
  return PRESET_AGENTS[index].name;
}

type WalletIconName = "chat" | "agents" | "wallet" | "send" | "swap" | "receive" | "buy" | "theme" | "menu" | "more" | "pin" | "trash";
function WalletIcon({ name, size = 20 }: { name: WalletIconName; size?: number }) {
  const paths: Record<WalletIconName, ReactNode> = {
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-9.5a7.5 7.5 0 1 1 17 0Z" /><path d="M7 11.5h9M7 15h5" /></>,
    agents: <><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z" /><path d="M12 8v8M8 12h8" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M16 15h2" /></>,
    send: <><path d="M5 19 19 5M9 5h10v10" /></>,
    swap: <><path d="M4 8h15l-3-3M20 16H5l3 3" /></>,
    receive: <><path d="M12 3v16m-6-6 6 6 6-6M4 21h16" /></>,
    buy: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M7 12h10" /></>,
    theme: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2.2 2.2 0 0 0 1.7-3.6 1.6 1.6 0 0 1 1.2-2.6H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z" /><path d="M7.5 11h.01M10 7h.01M15 7.5h.01M17 11h.01" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    pin: <><path d="m14 4 6 6-3 1-4 4-1 5-2-6-5-5 5-1 4-4Z" /><path d="m9 15-5 5" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const CHAT_PINS_EVENT = "auevo-wallet-chat-pins-change";
function subscribeToChatPins(callback: () => void) {
  window.addEventListener(CHAT_PINS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHAT_PINS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
function getChatPinsSnapshot(key: string) {
  try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; }
}

/** A preset's mood by name, for agents already saved to the DB (which only
 * carries name/persona/accent/emoji — see migration 0018) — lets the chat
 * header and message bubbles draw the same little face for a preset agent
 * picked earlier, without duplicating mood data server-side. */
function moodForAgentName(name: string): Mood | null {
  return PRESET_AGENTS.find((p) => p.name === name)?.mood ?? null;
}

/**
 * A small illustrated face rather than a bare emoji — every preset gets a
 * distinct, simple expression (not just a different color) so "Sage" and
 * "Bolt" read as different characters at a glance, not the same dot in a
 * different shade. Pure inline SVG: no image assets, crisp at any size.
 */
function PersonaAvatar({ mood, color, size = 36, name }: { mood: Mood; color: string; size?: number; name?: string }) {
  if (name && PRESET_AGENTS.some((p) => p.name === name)) return <AgentPortrait name={name} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r="20" fill={color} />
      {mood === "neutral" && (
        <>
          <circle cx="14" cy="18" r="2.3" fill="#10151f" />
          <circle cx="26" cy="18" r="2.3" fill="#10151f" />
          <path d="M14 26 H26" stroke="#10151f" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {mood === "wise" && (
        <>
          <path d="M9 18 Q14 13 19 18" stroke="#10151f" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M21 18 Q26 13 31 18" stroke="#10151f" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M15 27 Q20 30.5 25 27" stroke="#10151f" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === "excited" && (
        <>
          <path d="M11 15 L16 19.5 L11 24" stroke="#10151f" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M29 15 L24 19.5 L29 24" stroke="#10151f" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 27 Q20 34 27 27" stroke="#10151f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === "calm" && (
        <>
          <path d="M10 18 H18" stroke="#10151f" strokeWidth="2" strokeLinecap="round" />
          <path d="M22 18 H30" stroke="#10151f" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 26.5 Q20 28.5 24 26.5" stroke="#10151f" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/**
 * Named color schemes — default matches the main site's own light design
 * (hybrid.css's --hy-blue etc.), plus a few others so a viewer isn't stuck
 * with just that one. Persisted client-side only (localStorage): it's a
 * per-viewer display preference, never something the server needs to know
 * or that other people should see.
 */
const THEMES: { id: string; label: string; description: string; swatch: string }[] = [
  { id: "cosmic", label: "Deep Orbit", description: "Cobalt planet", swatch: "#52bdff" },
  { id: "blue-light", label: "Lunar Glass", description: "Silver daylight", swatch: "#2458e8" },
  { id: "sky-light", label: "Ice Nebula", description: "Frozen cyan", swatch: "#0fb3d6" },
  { id: "violet-light", label: "Aurora Pearl", description: "Soft stellar veil", swatch: "#7c4dff" },
  { id: "green-dark", label: "Bio Cosmos", description: "Emerald life", swatch: "#5fe6a3" },
  { id: "violet-dark", label: "Event Horizon", description: "Dark singularity", swatch: "#b98bff" },
];
const THEME_STORAGE_KEY = "auevo-wallet-theme";
const THEME_CHANGE_EVENT = "auevo-wallet-theme-change";

/**
 * Reads/writes the theme via useSyncExternalStore rather than
 * useState+useEffect: localStorage is state that lives outside React, and
 * this is the pattern React itself recommends for that (also sidesteps a
 * server/client snapshot mismatch — getServerSnapshot below always returns
 * the default, matching what SSR/prerendering sees with no localStorage).
 * A custom event covers same-tab updates; the native "storage" event only
 * fires in *other* tabs.
 */
function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getThemeSnapshot(): string {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved && THEMES.some((t) => t.id === saved) ? saved : "cosmic";
  } catch {
    return "cosmic";
  }
}

function getThemeServerSnapshot(): string {
  return "cosmic";
}

function useWalletTheme(): [string, (id: string) => void] {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getThemeServerSnapshot);

  function setTheme(id: string) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // Private mode / blocked storage — the dispatch below still applies
      // the pick for the current tab, it just won't persist across visits.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return [theme, setTheme];
}

export default function WalletPage() {
  const [theme, setTheme] = useWalletTheme();

  // Guards calling usePrivy() below: WalletProviders only mounts
  // PrivyProvider when this env var is set (see providers.tsx), so
  // calling the hook without it throws — not caught by anything, which
  // is what was rendering this page as a blank screen in production
  // before this check existed. NEXT_PUBLIC_-prefixed vars are inlined at
  // build time, so this reads identically on the server and the client.
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <Shell theme={theme}>
        <div className={styles.loginGate}>
          <h1>AUEVO Wallet</h1>
          <p>Not configured yet — NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET need to be set for this environment.</p>
        </div>
      </Shell>
    );
  }
  return <PrivyGate theme={theme} setTheme={setTheme} />;
}

function PrivyGate({ theme, setTheme }: { theme: string; setTheme: (id: string) => void }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const address = user?.wallet?.address as `0x${string}` | undefined;

  if (!ready)
    return (
      <Shell theme={theme}>
        <div className={styles.emptyState}>Loading…</div>
      </Shell>
    );
  if (!authenticated || !address) return <LoginGate theme={theme} onLogin={login} />;

  return <WalletApp address={address} onLogout={logout} theme={theme} setTheme={setTheme} />;
}

// Three comets, staggered so they never launch together — see .comet /
// @keyframes wallet-comet-fly in wallet.module.css for the actual flight
// path (a long mostly-idle cycle with one quick diagonal streak).
const COMETS = [
  { left: "78%", duration: "13s", delay: "-2s" },
  { left: "40%", duration: "17s", delay: "-9s" },
  { left: "92%", duration: "21s", delay: "-14s" },
];

function Shell({ children, theme }: { children: React.ReactNode; theme: string }) {
  return (
    <div className={styles.walletRoot} data-theme={theme}>
      <div className={styles.spaceBg}>
        <span className={styles.scenePlanet} />
        <span className={styles.sceneOrbit} />
        {COMETS.map((c, i) => (
          <span
            key={i}
            className={styles.comet}
            style={{ left: c.left, animationDuration: c.duration, animationDelay: c.delay }}
          />
        ))}
      </div>
      {children}
    </div>
  );
}

function LoginGate({ theme, onLogin }: { theme: string; onLogin: () => void }) {
  return (
    <Shell theme={theme}>
      <div className={styles.loginGate}>
        <div className={styles.loginMark}><AuevoMark /></div>
        <span className={styles.loginEyebrow}>AUEVO WALLET</span>
        <h1>Your universe starts here.</h1>
        <p>Explore your assets with a cosmic AI guide. Sign in with email, phone or X; your access remains recoverable without a seed phrase to write down.</p>
        <button className={styles.loginBtn} onClick={onLogin}>
          Enter the wallet <span aria-hidden="true">↗</span>
        </button>
      </div>
    </Shell>
  );
}

function WalletApp({
  address,
  onLogout,
  theme,
  setTheme,
}: {
  address: `0x${string}`;
  onLogout: () => void;
  theme: string;
  setTheme: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"chats" | "agents">("chats");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  // Mobile-only drawers (see the @media block in wallet.module.css) — on
  // desktop the sidebar/panel are always visible and these stay false.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [chatStartBusy, setChatStartBusy] = useState(false);
  const [chatStartError, setChatStartError] = useState<string | null>(null);
  const [chatMenuId, setChatMenuId] = useState<string | null>(null);
  const [chatActionBusy, setChatActionBusy] = useState<string | null>(null);
  const [chatListError, setChatListError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatPinsKey = `auevo-wallet-chat-pins:${address.toLowerCase()}`;
  const chatPinsSnapshot = useSyncExternalStore(
    subscribeToChatPins,
    () => getChatPinsSnapshot(chatPinsKey),
    () => "[]",
  );
  const pinnedChatIds = useMemo(() => {
    try { return new Set<string>(JSON.parse(chatPinsSnapshot)); } catch { return new Set<string>(); }
  }, [chatPinsSnapshot]);

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
  const orderedChats = useMemo(
    () => [...(chatsQuery.data ?? [])].sort((a, b) => Number(pinnedChatIds.has(b.id)) - Number(pinnedChatIds.has(a.id))),
    [chatsQuery.data, pinnedChatIds],
  );

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

  const activeChat = (chatsQuery.data ?? []).find((c) => c.id === effectiveChatId) ?? null;
  const activeAgent = (agentsQuery.data ?? []).find((a) => a.id === activeChat?.agent_id) ?? null;

  function openPersonaPicker() {
    setChatStartError(null);
    setShowPersonaPicker(true);
  }

  function setChatPinned(chatId: string, pinned: boolean) {
    const next = new Set(pinnedChatIds);
    if (pinned) next.add(chatId);
    else next.delete(chatId);
    try { localStorage.setItem(chatPinsKey, JSON.stringify([...next])); } catch {}
    window.dispatchEvent(new Event(CHAT_PINS_EVENT));
    setChatMenuId(null);
  }

  async function deleteChat(chatId: string) {
    if (!window.confirm("Delete this chat and its messages? This cannot be undone.")) return;
    setChatActionBusy(chatId);
    setChatListError(null);
    try {
      const response = await walletFetch(`/api/wallet/chats/${chatId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Could not delete chat (${response.status})`);
      }
      const remaining = orderedChats.filter((chat) => chat.id !== chatId);
      qc.setQueryData<Chat[]>(["wallet-chats"], (current) => (current ?? []).filter((chat) => chat.id !== chatId));
      qc.removeQueries({ queryKey: ["wallet-messages", chatId] });
      setChatPinned(chatId, false);
      if (effectiveChatId === chatId) setSelectedChatId(remaining[0]?.id ?? null);
      await qc.invalidateQueries({ queryKey: ["wallet-chats"] });
    } catch (error) {
      setChatListError(error instanceof Error ? error.message : "Could not delete the chat.");
    } finally {
      setChatActionBusy(null);
      setChatMenuId(null);
    }
  }

  /**
   * Starts a chat with a given personality (a preset from PRESET_AGENTS,
   * or a user's own saved agent) — or a blank, agent-less chat when
   * `agent` is omitted entirely. Presets are created as an ordinary
   * wallet_agents row the first time they're picked (POST dedupes by
   * name), so a re-pick just reuses the same row.
   */
  async function startChat(agent?: { name: string; persona: string; accent: string; emoji: string } | Agent) {
    if (chatStartBusy) return;
    setChatStartBusy(true);
    setChatStartError(null);
    try {
      let agentId: string | null = null;
      if (agent) {
        const created = await walletFetchJson<Agent>("/api/wallet/agents", {
          method: "POST",
          body: JSON.stringify(
            "id" in agent
              ? { name: agent.name, persona: agent.persona, accentColor: agent.accent_color, emoji: agent.emoji }
              : { name: agent.name, persona: agent.persona, accentColor: agent.accent, emoji: agent.emoji }
          ),
        });
        agentId = created.id;
        await qc.invalidateQueries({ queryKey: ["wallet-agents"] });
      }
      const chat = await walletFetchJson<Chat>("/api/wallet/chats", {
        method: "POST",
        body: JSON.stringify({ agentId, title: agent?.name ?? "Blank chat" }),
      });
      setSelectedChatId(chat.id);
      setTab("chats");
      setShowPersonaPicker(false);
      setSidebarOpen(false);
      setPanelOpen(false);
      await qc.invalidateQueries({ queryKey: ["wallet-chats"] });
    } catch (error) {
      setChatStartError(error instanceof Error ? error.message : "Could not create the chat. Please try again.");
    } finally {
      setChatStartBusy(false);
    }
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
    <Shell theme={theme}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <AuevoMark />
          AUEVO
        </div>

        <div className={styles.navList}>
          <button className={tab === "chats" ? styles.navItemActive : styles.navItem} onClick={() => setTab("chats")}>
            <WalletIcon name="chat" size={19} /> Chats
          </button>
          <button className={tab === "agents" ? styles.navItemActive : styles.navItem} onClick={() => setTab("agents")}>
            <WalletIcon name="agents" size={19} /> Agents
          </button>
        </div>

        {tab === "chats" && (
          <>
            <div className={styles.chatListLabel}>
              <span>RECENT CHATS</span>
              <button onClick={openPersonaPicker} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
                +
              </button>
            </div>
            <div className={styles.chatList}>
              {(chatsQuery.data ?? []).length === 0 && <span className={styles.chatListLabel}>Start a conversation.</span>}
              {chatListError && <div className={styles.chatListError} role="alert">{chatListError}</div>}
              {orderedChats.map((c) => {
                const agent = (agentsQuery.data ?? []).find((a) => a.id === c.agent_id);
                const pinned = pinnedChatIds.has(c.id);
                return (
                  <div key={c.id} className={`${styles.chatListRow} ${c.id === effectiveChatId ? styles.chatListRowActive : ""}`}>
                    <button
                      type="button"
                      className={styles.chatListItem}
                      onClick={() => {
                        setSelectedChatId(c.id);
                        setChatMenuId(null);
                        setSidebarOpen(false);
                      }}
                    >
                      {pinned && <WalletIcon name="pin" size={13} />}
                      <span>{agent?.emoji ? `${agent.emoji} ` : ""}{c.title ?? "New chat"}</span>
                    </button>
                    <button type="button" className={styles.chatMoreBtn} aria-label={`Actions for ${c.title ?? "chat"}`} aria-expanded={chatMenuId === c.id} onClick={() => setChatMenuId((open) => open === c.id ? null : c.id)}>
                      <WalletIcon name="more" size={18} />
                    </button>
                    {chatMenuId === c.id && (
                      <div className={styles.chatActionMenu}>
                        <button type="button" onClick={() => setChatPinned(c.id, !pinned)}>
                          <WalletIcon name="pin" size={16} /> {pinned ? "Unpin" : "Pin chat"}
                        </button>
                        <button type="button" className={styles.chatDeleteAction} onClick={() => deleteChat(c.id)} disabled={chatActionBusy === c.id}>
                          <WalletIcon name="trash" size={16} /> {chatActionBusy === c.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "agents" && (
          <AgentsPanel
            agents={agentsQuery.data ?? []}
            onCreated={() => qc.invalidateQueries({ queryKey: ["wallet-agents"] })}
            onStartChat={(agent) => startChat(agent)}
          />
        )}

        <div className={styles.sidebarFooter}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            Log out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        {(() => {
          const mood = activeAgent ? moodForAgentName(activeAgent.name) : null;
          const avatarColor = activeAgent?.accent_color || "var(--wallet-accent)";
          return (
            <>
              <div className={styles.chatHeader}>
                <button className={styles.mobileOnlyBtn} onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                  <WalletIcon name="menu" />
                </button>
                <span className={styles.chatHeaderTitle}>
                  <PersonaAvatar mood={mood ?? "neutral"} color={avatarColor} size={22} name={activeAgent?.name} />
                  <span>{activeAgent ? activeAgent.name : "AUEVO"}</span>
                </span>
                <button className={styles.mobileOnlyBtn} onClick={() => setPanelOpen(true)} aria-label="Open wallet">
                  <WalletIcon name="wallet" />
                </button>
              </div>
              <div className={styles.messages}>
                {(messagesQuery.data ?? []).length === 0 && !streamingText && (
                  <div className={styles.emptyState}>
                    <div className={styles.agentStage}>
                      <div className={styles.agentStageHalo} aria-hidden="true" />
                      <AgentPortrait name={portraitForAgent(activeAgent?.name)} className={styles.heroPortrait} size={180} />
                    </div>
                    <h2>Your universe, your guide.</h2>
                    <p>Choose one of eight cosmic agents, or create your own. They can help you understand your wallet and markets; they can only read what you see here.</p>
                    <button type="button" className={styles.chooseAgentBtn} onClick={openPersonaPicker}>Choose an agent</button>
                  </div>
                )}
                {(messagesQuery.data ?? []).map((m) => (
                  <div key={m.id} className={m.role === "user" ? styles.msgRowUser : styles.msgRow}>
                    {m.role === "assistant" && <PersonaAvatar mood={mood ?? "neutral"} color={avatarColor} size={28} name={activeAgent?.name} />}
                    <div className={m.role === "user" ? styles.msgBubbleUser : styles.msgBubble}>{m.content}</div>
                  </div>
                ))}
                {streamingText !== null && (
                  <div className={styles.msgRow}>
                    <PersonaAvatar mood={mood ?? "neutral"} color={avatarColor} size={28} name={activeAgent?.name} />
                    <div className={styles.msgBubble}>{streamingText || "…"}</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </>
          );
        })()}

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
            <WalletIcon name="send" />
          </button>
        </form>
      </main>

      {(sidebarOpen || panelOpen) && (
        <div
          className={styles.scrim}
          onClick={() => {
            setSidebarOpen(false);
            setPanelOpen(false);
          }}
        />
      )}

      <WalletPanel
        address={address}
        balances={balancesQuery.data ?? []}
        loading={balancesQuery.isLoading}
        onSend={() => setShowSend(true)}
        onReceive={() => setShowReceive(true)}
        onSwap={() => setShowSwap(true)}
        theme={theme}
        setTheme={setTheme}
        mobileOpen={panelOpen}
        onMobileClose={() => setPanelOpen(false)}
      />

      {showSend && <SendModal onClose={() => setShowSend(false)} />}
      {showReceive && <ReceiveModal address={address} onClose={() => setShowReceive(false)} />}
      {showSwap && <SwapModal address={address} onClose={() => setShowSwap(false)} />}
      {showPersonaPicker && (
        <PersonaPicker
          customAgents={agentsQuery.data ?? []}
          onPick={(agent) => startChat(agent)}
          onBlank={() => startChat()}
          onClose={() => setShowPersonaPicker(false)}
          busy={chatStartBusy}
          error={chatStartError}
        />
      )}
    </Shell>
  );
}

function AgentsPanel({
  agents,
  onCreated,
  onStartChat,
}: {
  agents: Agent[];
  onCreated: () => void;
  onStartChat: (agent: Agent) => void;
}) {
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await walletFetchJson("/api/wallet/agents", {
        method: "POST",
        body: JSON.stringify({ name, persona }),
      });
      setName("");
      setPersona("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.chatList}>
      {agents.map((a) => {
        const mood = moodForAgentName(a.name);
        return (
          <button key={a.id} className={styles.agentRow} onClick={() => onStartChat(a)} title="Start a chat with this agent">
            {mood ? (
              <PersonaAvatar mood={mood} color={a.accent_color ?? "var(--wallet-accent)"} size={26} name={a.name} />
            ) : (
              <span className={styles.agentRowEmoji} style={{ background: a.accent_color ?? "var(--wallet-accent)" }}>
                {a.emoji ?? "✦"}
              </span>
            )}
            {a.name}
          </button>
        );
      })}
      <div className={styles.field} style={{ marginTop: 8 }}>
        <label className={styles.fieldLabel} htmlFor="agent-name">Name</label>
        <input id="agent-name" className={styles.fieldInput} placeholder="Agent name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="agent-persona">Persona</label>
        <textarea
          id="agent-persona"
          className={styles.fieldInput}
          placeholder="E.g. Explain wallet activity clearly and keep answers concise."
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          rows={3}
        />
        <span className={styles.fieldHint}>These instructions shape how your agent responds in chat. Optional.</span>
      </div>
      <button className={styles.primaryBtn} onClick={create} disabled={busy || !name.trim()}>
        Create agent
      </button>
    </div>
  );
}

function PersonaPicker({
  customAgents,
  onPick,
  onBlank,
  onClose,
  busy,
  error,
}: {
  customAgents: Agent[];
  onPick: (agent: { name: string; persona: string; accent: string; emoji: string } | Agent) => void;
  onBlank: () => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.personaModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalEyebrow}>NEW CHAT</div>
            <div className={styles.modalTitle}>Choose your agent</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.personaGrid}>
          {PRESET_AGENTS.map((p) => (
            <button type="button" key={p.name} className={styles.personaCard} onClick={() => onPick(p)} disabled={busy}>
              <AgentPortrait name={p.name} className={styles.personaArt} size={120} />
              <span className={styles.personaName}>{p.name}</span>
              <span className={styles.personaRole}>{p.role}</span>
            </button>
          ))}
          {customAgents.filter((a) => !PRESET_AGENTS.some((p) => p.name === a.name)).map((a) => {
            const mood = moodForAgentName(a.name);
            return (
              <button type="button" key={a.id} className={styles.personaCard} style={{ borderColor: a.accent_color ?? undefined }} onClick={() => onPick(a)} disabled={busy}>
                {mood ? (
                  <PersonaAvatar mood={mood} color={a.accent_color ?? "var(--wallet-accent)"} size={44} />
                ) : (
                  <span className={styles.personaEmoji} style={{ background: a.accent_color ?? "var(--wallet-accent)" }}>
                    {a.emoji ?? "✦"}
                  </span>
                )}
                <span className={styles.personaName}>{a.name}</span>
              </button>
            );
          })}
        </div>

        {error && <div className={styles.pickerError} role="alert">{error}</div>}
        <button type="button" className={`${styles.primaryBtn} ${styles.blankChatBtn}`} onClick={onBlank} disabled={busy}>
          {busy ? "Creating chat…" : "Start blank chat"}
        </button>
      </div>
    </div>
  );
}

function WalletPanel({
  address,
  balances,
  loading,
  onSend,
  onReceive,
  onSwap,
  theme,
  setTheme,
  mobileOpen,
  onMobileClose,
}: {
  address: string;
  balances: WalletBalance[];
  loading: boolean;
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
  theme: string;
  setTheme: (id: string) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [tab, setTab] = useState<"assets" | "activity">("assets");
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const { fundWallet } = useFundWallet();

  const usdcTotal = balances.filter((b) => b.symbol === "USDC").reduce((sum, b) => sum + Number(b.formatted), 0);

  async function handleBuy() {
    setBuyError(null);
    setBuyBusy(true);
    try {
      await fundWallet({ address });
    } catch (err) {
      // fundWallet rejects silently (no visible UI) if Privy's dashboard
      // hasn't enabled a funding method (MoonPay/Coinbase Onramp) for this
      // app yet — surfacing the message here is what makes that visible
      // instead of "the Buy button does nothing."
      setBuyError(err instanceof Error ? err.message : "Buy isn't available yet");
    } finally {
      setBuyBusy(false);
    }
  }

  return (
    <aside className={`${styles.panel} ${mobileOpen ? styles.panelOpen : ""}`}>
      <div className={styles.panelHeader}>
        <button className={styles.mobileOnlyBtn} onClick={onMobileClose} aria-label="Close wallet">
          ✕
        </button>
        <span className={styles.panelTitle}>My wallet</span>
        <ThemePicker theme={theme} onChange={setTheme} />
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
          <WalletIcon name="send" size={23} /><span>Send</span>
        </button>
        <button className={styles.actionBtn} onClick={onSwap}>
          <WalletIcon name="swap" size={23} /><span>Swap</span>
        </button>
        <button className={styles.actionBtn} onClick={onReceive}>
          <WalletIcon name="receive" size={23} /><span>Receive</span>
        </button>
        <button className={styles.actionBtn} onClick={handleBuy} disabled={buyBusy}>
          <WalletIcon name="buy" size={23} /><span>Buy</span>
        </button>
      </div>
      {buyError && <div className={styles.errorText}>{buyError}</div>}

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

function ThemePicker({ theme, onChange }: { theme: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={rootRef}>
      <button className={styles.themeBtn} onClick={() => setOpen((v) => !v)} title="Color scheme" aria-label="Change color scheme">
        <WalletIcon name="theme" size={19} />
      </button>
      {open && (
        <div className={styles.themePanel} style={{ position: "absolute", right: 0, top: 36, zIndex: 5, minWidth: 180 }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={t.id === theme ? styles.themeRowActive : styles.themeRow}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
            >
              <span className={styles.themeSwatch} style={{ background: t.swatch }} />
              <span><b>{t.label}</b><small>{t.description}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
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

function swapTokenAddress(asset: "ETH" | "USDC", chainId: number): `0x${string}` {
  return asset === "ETH" ? ZEROX_NATIVE_TOKEN : USDC_ADDRESS[chainId];
}

/**
 * Real swap via 0x's AllowanceHolder API (src/lib/wallet/zerox.ts) — ETH
 * <-> USDC only, same two assets Send/Receive already support. A quote is
 * fetched on demand (never auto-refreshed: 0x quotes go stale in seconds
 * and re-fetching silently out from under the user would show one number
 * and execute another), then Execute does an approve() first when needed
 * (USDC has no infinite allowance by default) and waits for its receipt
 * before sending the swap transaction — two separate wallet confirmations,
 * same as any other AllowanceHolder-flow swap UI.
 */
function SwapModal({ address, onClose }: { address: `0x${string}`; onClose: () => void }) {
  const { sendTransaction } = useSendTransaction();
  const [chainId, setChainId] = useState<number>(NETWORKS[0].id);
  const [sellAsset, setSellAsset] = useState<"ETH" | "USDC">("ETH");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<ZeroXQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buyAsset: "ETH" | "USDC" = sellAsset === "ETH" ? "USDC" : "ETH";
  const sellDecimals = sellAsset === "ETH" ? 18 : USDC_DECIMALS;
  const buyDecimals = buyAsset === "ETH" ? 18 : USDC_DECIMALS;

  function resetQuote() {
    setQuote(null);
    setError(null);
  }

  async function getQuote() {
    setError(null);
    if (!amount || Number(amount) <= 0) {
      setError("Enter an amount");
      return;
    }
    setQuoting(true);
    setQuote(null);
    try {
      const sellAmount = parseUnits(amount, sellDecimals).toString();
      const q = await walletFetchJson<ZeroXQuote>("/api/wallet/swap/quote", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          sellToken: swapTokenAddress(sellAsset, chainId),
          buyToken: swapTokenAddress(buyAsset, chainId),
          sellAmount,
          taker: address,
        }),
      });
      setQuote(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get a quote");
    } finally {
      setQuoting(false);
    }
  }

  async function executeSwap() {
    if (!quote) return;
    const chain = chainById(chainId);
    if (!chain) return;
    setError(null);
    setSwapping(true);
    try {
      if (sellAsset === "USDC" && quote.issues.allowance) {
        const spender = quote.issues.allowance.spender;
        const sellAmount = BigInt(quote.sellAmount);
        const client = publicClientForChain(chain);
        const currentAllowance: bigint = await client.readContract({
          address: USDC_ADDRESS[chainId],
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, spender],
        });
        if (currentAllowance < sellAmount) {
          setStep("Approving USDC…");
          const approveData = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, sellAmount] });
          const { hash } = await sendTransaction({ to: USDC_ADDRESS[chainId], data: approveData, chainId });
          await client.waitForTransactionReceipt({ hash });
        }
      }

      setStep("Swapping…");
      const value = BigInt(quote.transaction.value || "0");
      await sendTransaction({
        to: quote.transaction.to,
        data: quote.transaction.data,
        chainId,
        ...(value > 0n ? { value: `0x${value.toString(16)}` as `0x${string}` } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed");
    } finally {
      setSwapping(false);
      setStep(null);
    }
  }

  const receiveAmount = quote ? formatUnits(BigInt(quote.buyAmount), buyDecimals) : null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalEyebrow}>YOUR AUEVO WALLET</div>
            <div className={styles.modalTitle}>Swap</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Network</label>
          <select
            className={styles.fieldInput}
            value={chainId}
            onChange={(e) => {
              setChainId(Number(e.target.value));
              resetQuote();
            }}
          >
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>From</label>
          <select
            className={styles.fieldInput}
            value={sellAsset}
            onChange={(e) => {
              setSellAsset(e.target.value as "ETH" | "USDC");
              resetQuote();
            }}
          >
            <option value="ETH">ETH</option>
            <option value="USDC">USDC</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Amount</label>
          <input
            className={styles.fieldInput}
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              resetQuote();
            }}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>To</label>
          <input className={styles.fieldInput} value={buyAsset} readOnly />
        </div>

        {quote && receiveAmount && (
          <div className={styles.hint}>
            Estimated receive: {Number(receiveAmount).toFixed(buyAsset === "ETH" ? 5 : 2)} {buyAsset}. Confirmed only once you tap Swap below —
            0x quotes expire within seconds.
          </div>
        )}

        {error && <div className={styles.errorText}>{error}</div>}

        {!quote ? (
          <button className={styles.primaryBtn} onClick={getQuote} disabled={quoting}>
            {quoting ? "Getting quote…" : "Get quote"}
          </button>
        ) : (
          <button className={styles.primaryBtn} onClick={executeSwap} disabled={swapping}>
            {swapping ? step ?? "Swapping…" : `Swap ${sellAsset} → ${buyAsset}`}
          </button>
        )}
      </div>
    </div>
  );
}
