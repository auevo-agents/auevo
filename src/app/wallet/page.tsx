"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  usePrivy,
  useSendTransaction,
  useLinkAccount,
  useUnlinkOAuth,
  useExportWallet,
  useAddFunds,
  useFundWalletWithBankDeposit,
  useDepositAddress,
  type User,
} from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { encodeFunctionData, erc20Abi, formatUnits, parseEther, parseUnits } from "viem";
import { mainnet, base } from "viem/chains";
import { AuevoMark } from "@/app/auevo-logo";
import styles from "./wallet.module.css";
import { fetchWalletBalances, publicClientForChain, type WalletBalance } from "@/lib/wallet/balances";
import { chainById, USDC_ADDRESS, USDC_DECIMALS, WALLET_CHAINS } from "@/lib/wallet/tokens";
import { walletFetch, walletFetchJson } from "@/lib/wallet/api-client";
import { ZEROX_NATIVE_TOKEN, type ZeroXQuote } from "@/lib/wallet/zerox";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chains";

type Chat = { id: string; agent_id: string | null; title: string | null };
type Agent = { id: string; name: string; persona: string; accent_color: string | null; emoji: string | null };
type Message = { id: string; role: "user" | "assistant"; content: string };

type AssetSymbol = "ETH" | "USDC";

const NETWORK_ICON: Record<number, string> = {
  [mainnet.id]: "/logos/ethereum.svg",
  [base.id]: "/logos/base.svg",
  [ROBINHOOD_CHAIN_ID]: "/logos/robinhood.svg",
};

const NETWORKS = WALLET_CHAINS.map((c) => ({ id: c.id, label: c.name, icon: NETWORK_ICON[c.id] ?? "/logos/ethereum.svg" }));

const ASSET_META: Record<AssetSymbol, { name: string; icon: string }> = {
  ETH: { name: "Ethereum", icon: "/logos/ethereum.svg" },
  USDC: { name: "USD Coin", icon: "/logos/usdc.svg" },
};

/** USDC only exists on chains listed in USDC_ADDRESS (see tokens.ts) — e.g.
 * Robinhood Chain isn't, so it shows up as an ETH-only network everywhere
 * an asset picker reads this instead of hardcoding the two-asset list. */
function availableAssets(chainId: number): AssetSymbol[] {
  return USDC_ADDRESS[chainId] ? ["ETH", "USDC"] : ["ETH"];
}

type MdBlock =
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "paragraph"; text: string };

const TABLE_ROW_RE = /^\s*\|/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const HEADING_RE = /^#{1,4}\s+(.*)$/;
const LIST_ITEM_RE = /^\s*(?:[-*]|\d+\.)\s+(.*)$/;
const ORDERED_ITEM_RE = /^\s*\d+\./;

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * A small hand-rolled markdown subset — headings, bullet/numbered lists,
 * pipe tables, **bold** and `code` — covering what the wallet agent
 * actually produces (see the system prompt in api/wallet/agent/chat).
 * Deliberately not a full CommonMark parser or a new dependency: the
 * agent's replies are short, structured chat messages, not documents.
 */
function parseMarkdownBlocks(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: "heading", text: heading[1].trim() });
      i++;
      continue;
    }

    if (TABLE_ROW_RE.test(line) && lines[i + 1] !== undefined && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const ordered = ORDERED_ITEM_RE.test(line);
      const items: string[] = [];
      while (i < lines.length && LIST_ITEM_RE.test(lines[i])) {
        items.push(LIST_ITEM_RE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !HEADING_RE.test(lines[i]) && !LIST_ITEM_RE.test(lines[i]) && !TABLE_ROW_RE.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }
  return blocks;
}

/** Inline **bold** and `code` within a block of text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-b${n}`}>{match[1]}</strong>);
    } else {
      parts.push(
        <code key={`${keyPrefix}-c${n}`} className={styles.msgCode}>
          {match[2]}
        </code>
      );
    }
    n++;
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Renders an assistant message's markdown as real elements (headings,
 * lists, tables) instead of showing literal "**"/"|---|" syntax. User
 * messages skip this — they're plain typed text, not agent output. */
function renderAgentMessage(content: string): ReactNode {
  return (
    <>
      {parseMarkdownBlocks(content).map((block, bi) => {
        if (block.type === "heading") {
          return (
            <div key={bi} className={styles.msgHeading}>
              <span className={styles.msgHeadingIcon}>✦</span>
              {renderInline(block.text, `h${bi}`)}
            </div>
          );
        }
        if (block.type === "list") {
          const items = block.items.map((item, ii) => (
            <li key={ii} className={styles.msgListItem}>
              {!block.ordered && <span className={styles.msgBullet}>›</span>}
              {renderInline(item, `l${bi}-${ii}`)}
            </li>
          ));
          return block.ordered ? (
            <ol key={bi} className={styles.msgList}>
              {items}
            </ol>
          ) : (
            <ul key={bi} className={styles.msgList}>
              {items}
            </ul>
          );
        }
        if (block.type === "table") {
          return (
            <div key={bi} className={styles.msgTableWrap}>
              <table className={styles.msgTable}>
                <thead>
                  <tr>
                    {block.header.map((h, hi) => (
                      <th key={hi}>{renderInline(h, `th${bi}-${hi}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{renderInline(cell, `td${bi}-${ri}-${ci}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={bi} className={styles.msgParagraph}>
            {renderInline(block.text, `p${bi}`)}
          </p>
        );
      })}
    </>
  );
}

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

const AGENT_WELCOME: Record<string, { intro: string; traits: [string, string] }> = {
  Navigator: { intro: "I explore markets thoughtfully, compare opportunities using verified information, and explain uncertainty plainly.", traits: ["Thoughtful", "Market explorer"] },
  Sentinel: { intro: "I watch for portfolio risks and explain what the available evidence can—and cannot—tell us.", traits: ["Vigilant", "Risk focused"] },
  Architect: { intro: "I turn portfolio complexity into clear structures and practical scenarios you can understand.", traits: ["Measured", "Strategic"] },
  Vanguard: { intro: "I deliver focused market briefings and point out what deserves a closer look next.", traits: ["Energetic", "Concise"] },
  Oracle: { intro: "I make sense of wallet and on-chain data with calm, transparent reasoning.", traits: ["Calm", "Data minded"] },
  Nova: { intro: "I’m your curious scout for new assets and ecosystems. I separate verified facts from possibilities.", traits: ["Curious", "Discovery scout"] },
  Astra: { intro: "I research assets, issuers, and chains patiently, with a clear method and honest caveats.", traits: ["Patient", "Research led"] },
  Cipher: { intro: "I trace on-chain patterns carefully and flag anomalies without jumping to conclusions.", traits: ["Precise", "On-chain analyst"] },
};

function customAgentIntro(persona: string): string {
  const description = persona.trim().replace(/\s+/g, " ");
  if (!description) return "I’m here to help you explore your wallet and markets with clarity.";
  const summary = description.length > 140 ? `${description.slice(0, 137).replace(/\s+\S*$/, "")}…` : description;
  return `I’ll follow the persona you created for me: ${summary}`;
}

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

// Eye positions in each 3:4 portrait tile; the portrait itself remains whole.
const AGENT_EYE_POINTS = [
  [[56, 35], [77, 36]],
  [[44, 34], [63, 35]],
  [[41, 35], [64, 35]],
  [[60, 31]],
  [[49, 37], [66, 38]],
  [[48, 40], [69, 43]],
  [[44, 36], [68, 36]],
  [[53, 31]],
] as const;

function AnimatedAgentPortrait({ agentName }: { agentName?: string }) {
  const portraitName = portraitForAgent(agentName);
  const index = PRESET_AGENTS.findIndex((agent) => agent.name === portraitName);
  const eyes = AGENT_EYE_POINTS[index];
  const position = `${(index % 4) * 100 / 3}% ${index < 4 ? 0 : 100}%`;
  const portraitStyle = {
    "--portrait-position": position,
  } as CSSProperties;

  return (
    <div className={styles.agentStage} style={portraitStyle}>
      <div className={styles.agentStageHalo} aria-hidden="true" />
      <span className={styles.agentFigure} role="img" aria-label={`${agentName ?? portraitName} portrait`}>
        {eyes.map(([x, y], eyeIndex) => (
          <span key={eyeIndex} className={styles.agentEye} style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
      </span>
    </div>
  );
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

const DEFAULT_CHAIN_STORAGE_KEY = "auevo-wallet-default-chain";
const DEFAULT_CHAIN_CHANGE_EVENT = "auevo-wallet-default-chain-change";

function subscribeToDefaultChain(callback: () => void) {
  window.addEventListener(DEFAULT_CHAIN_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(DEFAULT_CHAIN_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Also usable directly (not just via the hook below) as a plain lazy
 * useState initializer — Send/Swap/Receive read this once at mount, since
 * each is a freshly-mounted modal every time it opens. */
function getDefaultChainSnapshot(): number {
  try {
    const saved = Number(localStorage.getItem(DEFAULT_CHAIN_STORAGE_KEY));
    return NETWORKS.some((n) => n.id === saved) ? saved : NETWORKS[0].id;
  } catch {
    return NETWORKS[0].id;
  }
}

function getDefaultChainServerSnapshot(): number {
  return NETWORKS[0].id;
}

/** Same localStorage + useSyncExternalStore pattern as useWalletTheme —
 * the Settings modal both reads and writes this reactively. */
function useDefaultChain(): [number, (id: number) => void] {
  const chainId = useSyncExternalStore(subscribeToDefaultChain, getDefaultChainSnapshot, getDefaultChainServerSnapshot);

  function setChainId(id: number) {
    try {
      localStorage.setItem(DEFAULT_CHAIN_STORAGE_KEY, String(id));
    } catch {
      // Private mode / blocked storage — still applies for this tab below.
    }
    window.dispatchEvent(new Event(DEFAULT_CHAIN_CHANGE_EVENT));
  }

  return [chainId, setChainId];
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
  if (!authenticated || !address || !user) return <LoginGate theme={theme} onLogin={login} />;

  return <WalletApp address={address} user={user} onLogout={logout} theme={theme} setTheme={setTheme} />;
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
  user,
  onLogout,
  theme,
  setTheme,
}: {
  address: `0x${string}`;
  user: User;
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
  const [showBuy, setShowBuy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [defaultChain, setDefaultChain] = useDefaultChain();
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
    // Was posting {} every time (email/phone/xHandle always null) — the
    // route exists specifically to mirror what's actually linked in Privy.
    walletFetch("/api/wallet/profile", {
      method: "PATCH",
      body: JSON.stringify({
        email: user.email?.address ?? null,
        phone: user.phone?.number ?? null,
        xHandle: user.twitter?.username ?? null,
      }),
    }).catch(() => {});
  }, [user]);

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
    // Load the persisted reply into the messages cache BEFORE dropping the
    // streaming bubble — invalidateQueries' promise resolves once the
    // refetch lands, so there's no gap where neither is showing the reply.
    await qc.invalidateQueries({ queryKey: ["wallet-messages", chatId] });
    setStreamingText(null);
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
            onDeleted={() => {
              void qc.invalidateQueries({ queryKey: ["wallet-agents"] });
              void qc.invalidateQueries({ queryKey: ["wallet-chats"] });
            }}
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
                    <AnimatedAgentPortrait agentName={activeAgent?.name} />
                    {activeAgent ? (
                      <>
                        <span className={styles.agentWelcomeRole}>{PRESET_AGENTS.find((a) => a.name === activeAgent.name)?.role ?? "Your custom agent"}</span>
                        <h2>Hi, I’m {activeAgent.name}.</h2>
                        <p>{AGENT_WELCOME[activeAgent.name]?.intro ?? customAgentIntro(activeAgent.persona)}</p>
                        <div className={styles.agentWelcomeTraits} aria-label="Agent characteristics">
                          {(AGENT_WELCOME[activeAgent.name]?.traits ?? ["Personalized", "Read-only"]).map((trait) => <span key={trait}>{trait}</span>)}
                        </div>
                      </>
                    ) : activeChat?.agent_id ? (
                      <p>{agentsQuery.isPending ? "Loading your agent…" : "This agent is unavailable right now."}</p>
                    ) : (
                      <>
                        <h2>Your universe, your guide.</h2>
                        <p>Choose one of eight cosmic agents, or create your own. They can help you understand your wallet and markets; they can only read what you see here.</p>
                        <button type="button" className={styles.chooseAgentBtn} onClick={openPersonaPicker}>Choose an agent</button>
                      </>
                    )}
                  </div>
                )}
                {(messagesQuery.data ?? []).map((m) => (
                  <div key={m.id} className={m.role === "user" ? styles.msgRowUser : styles.msgRow}>
                    {m.role === "assistant" && <PersonaAvatar mood={mood ?? "neutral"} color={avatarColor} size={28} name={activeAgent?.name} />}
                    <div className={m.role === "user" ? styles.msgBubbleUser : styles.msgBubble}>
                      {m.role === "assistant" ? renderAgentMessage(m.content) : m.content}
                    </div>
                  </div>
                ))}
                {streamingText !== null && (
                  <div className={styles.msgRow}>
                    <PersonaAvatar mood={mood ?? "neutral"} color={avatarColor} size={28} name={activeAgent?.name} />
                    <div className={styles.msgBubble}>{streamingText ? renderAgentMessage(streamingText) : "…"}</div>
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
            placeholder={activeAgent ? `Message ${activeAgent.name}…` : "Message AUEVO Wallet…"}
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
        onBuy={() => setShowBuy(true)}
        onSettings={() => setShowSettings(true)}
        theme={theme}
        setTheme={setTheme}
        mobileOpen={panelOpen}
        onMobileClose={() => setPanelOpen(false)}
      />

      {showSend && <SendModal balances={balancesQuery.data ?? []} onClose={() => setShowSend(false)} />}
      {showReceive && <ReceiveModal address={address} onClose={() => setShowReceive(false)} />}
      {showSwap && <SwapModal address={address} balances={balancesQuery.data ?? []} onClose={() => setShowSwap(false)} />}
      {showBuy && (
        <AddFundsModal
          address={address}
          onReceive={() => {
            setShowBuy(false);
            setShowReceive(true);
          }}
          onClose={() => setShowBuy(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          address={address}
          user={user}
          theme={theme}
          setTheme={setTheme}
          defaultChain={defaultChain}
          setDefaultChain={setDefaultChain}
          onClose={() => setShowSettings(false)}
        />
      )}
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
  onDeleted,
  onStartChat,
}: {
  agents: Agent[];
  onCreated: () => void;
  onDeleted: () => void;
  onStartChat: (agent: Agent) => void;
}) {
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function deleteAgent(agent: Agent) {
    if (!window.confirm(`Delete ${agent.name}? Existing chats will stay, but will no longer use this agent's persona.`)) return;
    setDeletingId(agent.id);
    setDeleteError(null);
    try {
      const response = await walletFetch(`/api/wallet/agents/${agent.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Could not delete ${agent.name}.`);
      }
      onDeleted();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete the agent.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={styles.chatList}>
      {agents.map((a) => {
        const mood = moodForAgentName(a.name);
        return (
          <div key={a.id} className={styles.agentListRow}>
            <button type="button" className={styles.agentRow} onClick={() => onStartChat(a)} title="Start a chat with this agent">
              {mood ? (
                <PersonaAvatar mood={mood} color={a.accent_color ?? "var(--wallet-accent)"} size={26} name={a.name} />
              ) : (
                <span className={styles.agentRowEmoji} style={{ background: a.accent_color ?? "var(--wallet-accent)" }}>
                  {a.emoji ?? "✦"}
                </span>
              )}
              <span className={styles.agentRowName}>{a.name}</span>
            </button>
            {!mood && (
              <button type="button" className={styles.agentDeleteBtn} onClick={() => deleteAgent(a)} disabled={deletingId === a.id} aria-label={`Delete ${a.name}`} title={`Delete ${a.name}`}>
                <WalletIcon name="trash" size={17} />
              </button>
            )}
          </div>
        );
      })}
      {deleteError && <div className={styles.chatListError} role="alert">{deleteError}</div>}
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
  onBuy,
  onSettings,
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
  onBuy: () => void;
  onSettings: () => void;
  theme: string;
  setTheme: (id: string) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [tab, setTab] = useState<"assets" | "activity">("assets");

  const usdcTotal = balances.filter((b) => b.symbol === "USDC").reduce((sum, b) => sum + Number(b.formatted), 0);

  return (
    <aside className={`${styles.panel} ${mobileOpen ? styles.panelOpen : ""}`}>
      <div className={styles.panelHeader}>
        <button className={styles.mobileOnlyBtn} onClick={onMobileClose} aria-label="Close wallet">
          ✕
        </button>
        <span className={styles.panelTitle}>My wallet</span>
        <span className={styles.panelHeaderActions}>
          <button className={styles.themeBtn} onClick={onSettings} title="Settings" aria-label="Settings">
            ⚙
          </button>
          <ThemePicker theme={theme} onChange={setTheme} />
        </span>
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
        <button className={styles.actionBtn} onClick={onBuy}>
          <WalletIcon name="buy" size={23} /><span>Buy</span>
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
                <img src={ASSET_META[b.symbol].icon} alt="" className={styles.assetIcon} />
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

/**
 * Account, appearance, wallet export and default-network preferences —
 * everything here is either real Privy account state (email/phone/X,
 * embedded wallet address, key export) or a local preference (theme,
 * default network), never a fabricated "username"/social-profile concept
 * this app's schema doesn't have.
 */
function SettingsModal({
  address,
  user,
  theme,
  setTheme,
  defaultChain,
  setDefaultChain,
  onClose,
}: {
  address: `0x${string}`;
  user: User;
  theme: string;
  setTheme: (id: string) => void;
  defaultChain: number;
  setDefaultChain: (id: number) => void;
  onClose: () => void;
}) {
  const { linkTwitter } = useLinkAccount();
  const { unlink } = useUnlinkOAuth();
  const { exportWallet } = useExportWallet();
  const [xBusy, setXBusy] = useState(false);
  const [xError, setXError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const identityLabel = user.email?.address ?? user.phone?.number ?? "Your Privy account";
  const avatarInitial = identityLabel.slice(0, 1).toUpperCase();

  async function handleUnlinkTwitter() {
    if (!user.twitter) return;
    setXError(null);
    setXBusy(true);
    try {
      await unlink({ provider: "twitter", subject: user.twitter.subject });
    } catch (err) {
      setXError(err instanceof Error ? err.message : "Couldn't unlink X");
    } finally {
      setXBusy(false);
    }
  }

  async function handleExport() {
    setExportError(null);
    setExportBusy(true);
    try {
      await exportWallet({ address });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Couldn't open export");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalEyebrow}>YOUR AUEVO WALLET</div>
            <div className={styles.modalTitle}>Settings</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionLabel}>Account</div>
          <div className={styles.settingsAccountRow}>
            <span className={styles.settingsAvatar}>{avatarInitial}</span>
            <div>
              <div className={styles.settingsAccountName}>{identityLabel}</div>
              <div className={styles.settingsAccountSub}>Signed in with Privy</div>
            </div>
          </div>

          <div className={styles.settingsRow}>
            <div>
              <div className={styles.settingsRowLabel}>Embedded wallet</div>
              <div className={styles.settingsRowValue}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </div>
            </div>
            <button
              type="button"
              className={styles.settingsLinkBtn}
              onClick={() => {
                navigator.clipboard?.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className={styles.settingsRow}>
            <div>
              <div className={styles.settingsRowLabel}>X account</div>
              <div className={styles.settingsRowSub}>{user.twitter?.username ? `@${user.twitter.username}` : "Not linked"}</div>
            </div>
            <button
              type="button"
              className={styles.settingsLinkBtn}
              onClick={user.twitter ? handleUnlinkTwitter : () => linkTwitter()}
              disabled={xBusy}
            >
              {user.twitter ? (xBusy ? "Unlinking…" : "Unlink") : "Link X"}
            </button>
          </div>
          {xError && <div className={styles.errorText}>{xError}</div>}
        </div>

        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionLabel}>Appearance</div>
          <div className={styles.settingsThemeGrid}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={t.id === theme ? styles.settingsThemeBtnActive : styles.settingsThemeBtn}
                onClick={() => setTheme(t.id)}
                title={t.label}
                aria-label={t.label}
              >
                <span className={styles.themeSwatch} style={{ background: t.swatch }} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionLabel}>Security &amp; wallet</div>
          <div className={styles.settingsRow}>
            <div>
              <div className={styles.settingsRowLabel}>Export wallet</div>
              <div className={styles.settingsRowSub}>Export your key for use in another compatible wallet.</div>
            </div>
            <button type="button" className={styles.settingsLinkBtn} onClick={handleExport} disabled={exportBusy}>
              {exportBusy ? "Opening…" : "Export"}
            </button>
          </div>
          {exportError && <div className={styles.errorText}>{exportError}</div>}
        </div>

        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionLabel}>Network</div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Default network for Send / Receive / Swap</label>
            <NetworkPicker chainId={defaultChain} onChange={setDefaultChain} />
          </div>
        </div>
      </div>
    </div>
  );
}

function caip2(chainId: number): `${string}:${string}` {
  return `eip155:${chainId}`;
}

/**
 * "Buy" used to be a single bare call to the deprecated useFundWallet with
 * no fallback UI — this replaces it with Privy's current funding hooks
 * (useAddFunds/useFundWalletWithBankDeposit/useDepositAddress), split into
 * a picker the way most wallets present it instead of one opaque button.
 * Card/bank/exchange all depend on funding providers enabled in this app's
 * Privy Dashboard — not something this code can turn on, so a failure here
 * surfaces Privy's own error rather than pretending it worked. Receive
 * crypto never depends on that: it's just this wallet's own address/QR,
 * so it hands off to the existing ReceiveModal.
 */
function AddFundsModal({
  address,
  onReceive,
  onClose,
}: {
  address: `0x${string}`;
  onReceive: () => void;
  onClose: () => void;
}) {
  const [chainId, setChainId] = useState<number>(getDefaultChainSnapshot);
  const { addFunds } = useAddFunds();
  const { fund: fundByBank } = useFundWalletWithBankDeposit();
  const { createDepositAddress } = useDepositAddress();
  const [busyRow, setBusyRow] = useState<"card" | "bank" | "exchange" | null>(null);
  const [rowError, setRowError] = useState<{ row: string; message: string } | null>(null);

  const network = NETWORKS.find((n) => n.id === chainId) ?? NETWORKS[0];
  const usdcAddress = USDC_ADDRESS[chainId];

  async function handleCard() {
    if (!usdcAddress) return;
    setRowError(null);
    setBusyRow("card");
    try {
      await addFunds({ destination: { address, chain: caip2(chainId), asset: usdcAddress }, fiat: { source: { defaultAsset: "usd" } } });
      onClose();
    } catch (err) {
      setRowError({ row: "card", message: err instanceof Error ? err.message : "Card funding isn't available yet" });
    } finally {
      setBusyRow(null);
    }
  }

  async function handleBank() {
    if (!usdcAddress) return;
    setRowError(null);
    setBusyRow("bank");
    try {
      await fundByBank({
        source: { assets: ["usd"], defaultAsset: "usd" },
        destination: { asset: "usdc", chain: caip2(chainId), address },
        provider: "bridge",
      });
      onClose();
    } catch (err) {
      setRowError({ row: "bank", message: err instanceof Error ? err.message : "Bank transfer isn't available yet" });
    } finally {
      setBusyRow(null);
    }
  }

  async function handleExchange() {
    if (!usdcAddress) return;
    setRowError(null);
    setBusyRow("exchange");
    try {
      await createDepositAddress({ destinationChain: caip2(chainId), destinationCurrency: usdcAddress, destinationAddress: address });
      onClose();
    } catch (err) {
      setRowError({ row: "exchange", message: err instanceof Error ? err.message : "Couldn't start a deposit from an exchange" });
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalEyebrow}>YOUR AUEVO WALLET</div>
            <div className={styles.modalTitle}>Add funds</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Network</label>
          <NetworkPicker chainId={chainId} onChange={setChainId} />
        </div>

        <div className={styles.fieldLabel} style={{ marginBottom: 10 }}>
          Choose how you&apos;d like to add funds.
        </div>

        <div className={styles.fundList}>
          <button type="button" className={styles.fundRow} onClick={handleCard} disabled={!usdcAddress || busyRow !== null}>
            <span className={styles.fundIconBox}>
              <WalletIcon name="buy" size={19} />
            </span>
            <span className={styles.fundRowBody}>
              <span className={styles.fundRowTitle}>Pay with card</span>
              <span className={styles.fundRowSub}>
                {busyRow === "card" ? "Opening…" : !usdcAddress ? `Not available on ${network.label}` : "Cards and digital payments"}
              </span>
            </span>
            <span className={styles.fundChevron}>›</span>
          </button>
          {rowError?.row === "card" && <div className={styles.errorText}>{rowError.message}</div>}

          <button type="button" className={styles.fundRow} onClick={handleBank} disabled={!usdcAddress || busyRow !== null}>
            <span className={styles.fundIconBox}>
              <WalletIcon name="wallet" size={19} />
            </span>
            <span className={styles.fundRowBody}>
              <span className={styles.fundRowTitle}>Bank transfer</span>
              <span className={styles.fundRowSub}>
                {busyRow === "bank" ? "Opening…" : !usdcAddress ? `Not available on ${network.label}` : "Deposit from your bank"}
              </span>
            </span>
            <span className={styles.fundChevron}>›</span>
          </button>
          {rowError?.row === "bank" && <div className={styles.errorText}>{rowError.message}</div>}

          <button type="button" className={styles.fundRow} onClick={handleExchange} disabled={!usdcAddress || busyRow !== null}>
            <span className={styles.fundIconBox}>
              <WalletIcon name="swap" size={19} />
            </span>
            <span className={styles.fundRowBody}>
              <span className={styles.fundRowTitle}>Transfer from exchange</span>
              <span className={styles.fundRowSub}>
                {busyRow === "exchange" ? "Opening…" : !usdcAddress ? `Not available on ${network.label}` : "Send crypto from your exchange"}
              </span>
            </span>
            <span className={styles.fundChevron}>›</span>
          </button>
          {rowError?.row === "exchange" && <div className={styles.errorText}>{rowError.message}</div>}

          <button type="button" className={styles.fundRow} onClick={onReceive}>
            <span className={styles.fundIconBox}>
              <WalletIcon name="receive" size={19} />
            </span>
            <span className={styles.fundRowBody}>
              <span className={styles.fundRowTitle}>Receive crypto</span>
              <span className={styles.fundRowSub}>Use your address or QR code</span>
            </span>
            <span className={styles.fundChevron}>›</span>
          </button>
        </div>

        <div className={styles.hint}>
          Card, bank transfer and exchange deposit go through funding providers enabled in this app&apos;s Privy Dashboard — if one errors, that&apos;s
          where it gets turned on, not something fixable from this screen. Receive crypto always works — it&apos;s just your address.
        </div>
      </div>
    </div>
  );
}

/** Outside-click-to-close for the small absolute-positioned dropdowns
 * below (NetworkPicker/AssetPicker) — same pattern ThemePicker above
 * already uses. */
function useCloseOnOutsideClick(open: boolean, onClose: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);
  return rootRef;
}

/** Network selector: an icon+name pill that expands into a dropdown of
 * every wallet chain, each row showing that chain's own gas balance when
 * `balances` is passed (Send/Swap have it; Receive doesn't need it). */
function NetworkPicker({
  chainId,
  onChange,
  balances,
}: {
  chainId: number;
  onChange: (id: number) => void;
  balances?: WalletBalance[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useCloseOnOutsideClick(open, () => setOpen(false));
  const current = NETWORKS.find((n) => n.id === chainId) ?? NETWORKS[0];

  return (
    <div className={styles.pickerWrap} ref={rootRef}>
      <button type="button" className={styles.networkPill} onClick={() => setOpen((v) => !v)}>
        <span className={styles.pillLeft}>
          <img src={current.icon} alt="" className={styles.pillIcon} />
          {current.label.toUpperCase()}
        </span>
        <span className={styles.pillChevron}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className={styles.pickerPanel}>
          {NETWORKS.map((n) => {
            const bal = balances?.find((b) => b.chainId === n.id && b.symbol === "ETH");
            return (
              <button
                key={n.id}
                type="button"
                className={n.id === chainId ? styles.pickerRowActive : styles.pickerRow}
                onClick={() => {
                  onChange(n.id);
                  setOpen(false);
                }}
              >
                <span className={styles.pickerRowLeft}>
                  <img src={n.icon} alt="" className={styles.pickerRowIcon} />
                  <span className={styles.pickerRowName}>{n.label}</span>
                </span>
                {bal && <span className={styles.pickerRowValue}>{Number(bal.formatted).toFixed(4)} ETH</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Asset selector, shared by Send (a full-width row, `variant="full"`) and
 * Swap (a small inline pill next to the amount, `variant="compact"`).
 * Lists only what `availableAssets(chainId)` actually offers on this
 * chain — e.g. Robinhood Chain has no USDC entry, so it only lists ETH
 * there rather than a token picker that would send to nowhere. A row's
 * "≈ $" is shown only for USDC: it's a USD stablecoin by definition, not
 * a guessed conversion the way an ETH price would be.
 */
function AssetPicker({
  variant,
  chainId,
  chainName,
  value,
  onChange,
  balances,
}: {
  variant: "full" | "compact";
  chainId: number;
  chainName: string;
  value: AssetSymbol;
  onChange: (a: AssetSymbol) => void;
  balances: WalletBalance[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useCloseOnOutsideClick(open, () => setOpen(false));
  const options = availableAssets(chainId);
  const meta = ASSET_META[value];

  return (
    <div className={styles.pickerWrap} ref={rootRef}>
      <button type="button" className={variant === "full" ? styles.assetPill : styles.swapTokenBtn} onClick={() => setOpen((v) => !v)}>
        <img src={meta.icon} alt="" className={styles.pillIcon} />
        {value}
        <span className={styles.pillChevron}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className={variant === "full" ? styles.pickerPanel : styles.pickerPanelCompact}>
          <div className={styles.pickerSectionLabel}>YOUR ASSETS · {chainName}</div>
          {options.map((sym) => {
            const bal = balances.find((b) => b.chainId === chainId && b.symbol === sym);
            const symMeta = ASSET_META[sym];
            const formatted = bal ? Number(bal.formatted).toFixed(sym === "ETH" ? 5 : 2) : "0";
            return (
              <button
                key={sym}
                type="button"
                className={sym === value ? styles.pickerRowActive : styles.pickerRow}
                onClick={() => {
                  onChange(sym);
                  setOpen(false);
                }}
              >
                <span className={styles.pickerRowLeft}>
                  <img src={symMeta.icon} alt="" className={styles.pickerRowIcon} />
                  <span>
                    <div className={styles.pickerRowName}>{sym}</div>
                    <div className={styles.pickerRowSub}>
                      {formatted} {sym}
                      {sym === "USDC" ? ` · ≈ $${formatted}` : ""}
                    </div>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SendModal({
  balances,
  onClose,
}: {
  balances: WalletBalance[];
  onClose: () => void;
}) {
  const { sendTransaction } = useSendTransaction();
  const [chainId, setChainId] = useState<number>(getDefaultChainSnapshot);
  const [asset, setAsset] = useState<AssetSymbol>("ETH");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const network = NETWORKS.find((n) => n.id === chainId) ?? NETWORKS[0];
  const balance = balances.find((b) => b.chainId === chainId && b.symbol === asset);

  function changeChain(id: number) {
    setChainId(id);
    if (!availableAssets(id).includes(asset)) setAsset("ETH");
  }

  function handleMax() {
    if (!balance) return;
    if (asset === "ETH") {
      const buffer = parseEther("0.002");
      setAmount(formatUnits(balance.raw > buffer ? balance.raw - buffer : 0n, 18));
    } else {
      setAmount(balance.formatted);
    }
  }

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
        const value = parseUnits(amount, USDC_DECIMALS);
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
          <NetworkPicker chainId={chainId} onChange={changeChain} balances={balances} />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Asset</label>
          <AssetPicker variant="full" chainId={chainId} chainName={network.label} value={asset} onChange={setAsset} balances={balances} />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Send to</label>
          <input className={styles.fieldInput} placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Amount</label>
          <input className={styles.fieldInput} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className={styles.swapBalanceRow}>
            <span>
              Balance: {balance ? Number(balance.formatted).toFixed(asset === "ETH" ? 5 : 2) : "0"} {asset}
            </span>
            <button type="button" className={styles.maxBtn} onClick={handleMax} disabled={!balance}>
              MAX
            </button>
          </div>
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
  const [chainId, setChainId] = useState<number>(getDefaultChainSnapshot);
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
          <NetworkPicker chainId={chainId} onChange={setChainId} />
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

function swapTokenAddress(asset: AssetSymbol, chainId: number): `0x${string}` {
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
function SwapModal({
  address,
  balances,
  onClose,
}: {
  address: `0x${string}`;
  balances: WalletBalance[];
  onClose: () => void;
}) {
  const { sendTransaction } = useSendTransaction();
  const [chainId, setChainId] = useState<number>(getDefaultChainSnapshot);
  const [sellAsset, setSellAsset] = useState<AssetSymbol>("ETH");
  const [buyAsset, setBuyAsset] = useState<AssetSymbol>("USDC");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<ZeroXQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const network = NETWORKS.find((n) => n.id === chainId) ?? NETWORKS[0];
  const options = availableAssets(chainId);
  const sellDecimals = sellAsset === "ETH" ? 18 : USDC_DECIMALS;
  const buyDecimals = buyAsset === "ETH" ? 18 : USDC_DECIMALS;
  const sellBalance = balances.find((b) => b.chainId === chainId && b.symbol === sellAsset);

  function changeChain(id: number) {
    setChainId(id);
    const opts = availableAssets(id);
    const nextSell = opts.includes(sellAsset) ? sellAsset : opts[0];
    const nextBuy = opts.find((o) => o !== nextSell) ?? nextSell;
    setSellAsset(nextSell);
    setBuyAsset(nextBuy);
    setAmount("");
    setQuote(null);
    setError(null);
  }

  function pickSell(next: AssetSymbol) {
    if (next === buyAsset) setBuyAsset(sellAsset);
    setSellAsset(next);
    setQuote(null);
    setError(null);
  }

  function pickBuy(next: AssetSymbol) {
    if (next === sellAsset) setSellAsset(buyAsset);
    setBuyAsset(next);
    setQuote(null);
    setError(null);
  }

  function flip() {
    setSellAsset(buyAsset);
    setBuyAsset(sellAsset);
    setAmount("");
    setQuote(null);
    setError(null);
  }

  function handleMax() {
    if (!sellBalance) return;
    if (sellAsset === "ETH") {
      const buffer = parseEther("0.002");
      setAmount(formatUnits(sellBalance.raw > buffer ? sellBalance.raw - buffer : 0n, 18));
    } else {
      setAmount(sellBalance.formatted);
    }
  }

  async function fetchQuote(forAmount: string) {
    setQuoting(true);
    setError(null);
    try {
      const sellAmount = parseUnits(forAmount, sellDecimals).toString();
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

  // Auto-quotes as the user types, debounced — 0x quotes go stale in
  // seconds anyway, so refetching in the background costs nothing extra
  // and means "Review Swap" is usually ready the moment they look at it.
  // Every place that changes amount/sellAsset/buyAsset/chainId already
  // clears the previous quote itself (in its own event handler, not here)
  // so this effect only ever schedules the next fetch — it never calls
  // setState synchronously in its own body.
  useEffect(() => {
    if (!amount || Number(amount) <= 0 || sellAsset === buyAsset) return;
    const handle = setTimeout(() => {
      fetchQuote(amount);
    }, 600);
    return () => clearTimeout(handle);
    // fetchQuote closes over chainId/sellAsset/buyAsset/address, all of
    // which are already effect deps via the values below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, sellAsset, buyAsset, chainId]);

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
  const hasAmount = !!amount && Number(amount) > 0;

  let buttonLabel = "Enter an amount";
  if (hasAmount && swapping) buttonLabel = step ?? "Swapping…";
  else if (hasAmount && quoting) buttonLabel = "Getting quote…";
  else if (hasAmount && quote) buttonLabel = "Review Swap";
  else if (hasAmount && error) buttonLabel = "Retry quote";
  else if (hasAmount) buttonLabel = "Getting quote…";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.swapModal}`} onClick={(e) => e.stopPropagation()}>
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
          <NetworkPicker chainId={chainId} onChange={changeChain} balances={balances} />
        </div>

        {options.length < 2 ? (
          <div className={styles.hint}>{network.label} only has one asset in this wallet right now (ETH) — nothing to swap it into yet.</div>
        ) : (
          <>
            <div className={styles.swapBox}>
              <div className={styles.swapBoxLabel}>You pay</div>
              <div className={styles.swapAmountRow}>
                <input
                  className={styles.swapAmountInput}
                  placeholder="0.00"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setQuote(null);
                    setError(null);
                  }}
                />
                <AssetPicker variant="compact" chainId={chainId} chainName={network.label} value={sellAsset} onChange={pickSell} balances={balances} />
              </div>
              <div className={styles.swapBalanceRow}>
                <span>
                  Balance: {sellBalance ? Number(sellBalance.formatted).toFixed(sellAsset === "ETH" ? 5 : 2) : "0"} {sellAsset}
                </span>
                <button type="button" className={styles.maxBtn} onClick={handleMax} disabled={!sellBalance}>
                  MAX
                </button>
              </div>
            </div>

            <div className={styles.swapDirectionWrap}>
              <button type="button" className={styles.swapDirectionBtn} onClick={flip} aria-label="Swap direction" title="Swap direction">
                ⇅
              </button>
            </div>

            <div className={styles.swapBox}>
              <div className={styles.swapBoxLabel}>You receive</div>
              <div className={styles.swapAmountRow}>
                <div className={styles.swapAmountInput}>{receiveAmount ? Number(receiveAmount).toFixed(buyAsset === "ETH" ? 5 : 2) : "0.00"}</div>
                <AssetPicker variant="compact" chainId={chainId} chainName={network.label} value={buyAsset} onChange={pickBuy} balances={balances} />
              </div>
              <div className={styles.hint}>Estimated after network and route fees. 0x quotes expire within seconds — confirmed only once you swap.</div>
            </div>

            {error && <div className={styles.errorText}>{error}</div>}

            <button
              className={styles.primaryBtn}
              onClick={() => (quote ? executeSwap() : hasAmount && fetchQuote(amount))}
              disabled={!hasAmount || quoting || swapping}
            >
              {buttonLabel}
            </button>
            <div className={styles.hint}>Max leaves a small ETH buffer for gas. Review and confirm in your Privy wallet.</div>
          </>
        )}
      </div>
    </div>
  );
}
