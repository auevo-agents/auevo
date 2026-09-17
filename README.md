# Auevo — Bot Fee Calculator

Paste a Solana wallet address, see how much it's paid trading bots (Axiom,
BullX, Trojan, BonkBot, etc.) in fees over the last 90 days.

This is Step 1 of the Auevo plan: a free, viral, zero-risk tool that proves
demand before deciding what (if anything) gets built next.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Helius Enhanced Transactions API for wallet history
- No database yet (v1 is stateless — see Roadmap)

## Setup

```bash
npm install
cp .env.example .env.local
# add your Helius API key to .env.local (free tier at https://helius.dev)
npm run dev
```

Open http://localhost:3000

## How fee detection works

`src/lib/bot-fees.ts` holds a registry of confirmed fee-collector wallet
addresses for ~25 Solana trading bots (Trojan, BonkBot, Banana Gun, Bloom,
Maestro, MevX, Unibot, and others). Source: the hardcoded `fee_receiver`
constants in github.com/duneanalytics/spellbook's own production Solana
indexing models — the same addresses Dune's dashboards use.

`src/lib/scan.ts` pulls the wallet's transaction history from Helius,
finds every native SOL transfer FROM the wallet TO one of those addresses,
and sums it up, converted to USD at the current SOL price.

### Known gap: Axiom, BullX, Photon, GMGN

These four are the biggest bots by revenue but are **not** in this registry.
They don't collect fees via a simple fixed wallet — the fee looks like it's
folded into their own on-chain program's swap instruction (possibly via a
per-referrer PDA, given Axiom's 30%/3% referral revenue-share). Detecting
them needs a different approach: identify their program ID(s), pull a
handful of real transactions via Solscan, and reverse-engineer the specific
instruction/account that receives the fee. Not started yet — this is the
top priority before launch, since these four are most of the total fee
volume the brief documented.

## Roadmap (from the product brief)

1. Done — basic scanner working for ~25 smaller bots
2. Next — crack fee detection for Axiom/BullX/Photon/GMGN
3. Shareable result card (OG image generation for Twitter)
4. Store scan results + optional email capture (Supabase) — this is the
   data source for deciding what to build next, per the brief
5. Historical SOL price per-transaction instead of current price (v1
   approximates using today's SOL/USD price for every trade — fine for a
   rough number, not fine for a precise one)
6. Deploy to auevo.io (Vercel)

## Deploy

Standard Vercel deploy. Set `HELIUS_API_KEY` as an environment variable in
the Vercel project settings.
