/**
 * Registry of known Solana trading-bot fee-collector wallet addresses.
 *
 * Source for the confirmed entries: github.com/duneanalytics/spellbook,
 * dbt_subprojects/solana/models/_sector/dex/bot_trades/solana/platforms/*.sql
 * — these are the hardcoded `fee_receiver` constants Dune's own production
 * indexing models use to detect each bot's trades. Checked 2026-09-17.
 *
 * Trojan rotates fee wallets AND fee-collector addresses beyond what's
 * listed: 2 more addresses (2jwHNx..., GV4Bt6...) found 2026-09-17 via one
 * tx (program "Trojan Trade" = troyXT7Ty3s2rjJe4bqWaroUrS4Fjd8rbHHNHxcACF4),
 * then a SECOND tx same day showed yet two more unlisted destinations
 * ("Trojan Fees" and one unlabeled). Given addresses keep not repeating,
 * Trojan is now `programOnly` too — the known addresses stay as a fast
 * path but aren't relied on to be complete.
 *
 * Bots that route fees through their own on-chain program instead of a
 * fixed wallet (BullX) are NOT detectable this way yet — needs the same
 * manual tx-inspection treatment Photon, GMGN, Axiom and Trojan got below.
 *
 * Photon: TWO different programs seen so far (HAAoKJrd...aia6hD from the
 * first tx checked, BSfD6SHZ...1mrRW — labeled "Photon Program" — from a
 * second tx 2026-09-17), each paying a DIFFERENT fee-vault address neither
 * of which is in `addresses` below. `programOnly` is set so any further
 * unlisted vaults get caught automatically rather than needing to be found
 * one by one.
 *
 * GMGN: Solscan itself labels the program "GMGN Bot Program" and the fee
 * destination "GMGN Fees Vault 5" — the "5" strongly suggests there are
 * at least 4 other vault addresses rotating, so `programOnly` is set here
 * too rather than trying to enumerate every vault.
 *
 * Axiom — the biggest bot by fee volume per the brief — sent its fee to a
 * DIFFERENT address in each of 2 transactions checked 2026-09-17, so no
 * address list is kept for it at all; detection is 100% programOnly via
 * "Axiom Trade" = FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9.
 *
 * `programOnly` mechanics (see scan.ts): for a tx touching any of a bot's
 * `programIds`, every native SOL transfer OUT of the wallet that isn't
 * already claimed by a different bot's known address is summed and
 * attributed to that bot. Risk: could misattribute an unrelated native-SOL
 * transfer riding in the same tx (e.g. paying with raw SOL instead of
 * WSOL) — not observed in samples checked so far, but worth re-verifying
 * against more transactions before trusting this at scale.
 */

export type Chain = "solana" | "ethereum" | "bsc" | "robinhood";

export interface BotFeeWallets {
  /** Display name shown to the user */
  name: string;
  /** One or more fee-collector wallet addresses (some bots rotate/load-balance) */
  addresses: string[];
  /**
   * Which chain these addresses live on. Omitted = "solana" (the only chain
   * v1 supports) so the ~25 existing entries don't all need editing now;
   * set explicitly when adding the first non-Solana bot.
   */
  chain?: Chain;
  /**
   * Optional: the bot's on-chain program ID(s). When set, scan.ts only
   * counts a transfer to `addresses` if the same transaction also touched
   * one of these programs — cuts false positives for bots confirmed via a
   * single sample transaction rather than a canonical source like Dune
   * spellbook. Bots can use more than one program (Photon does).
   */
  programIds?: string[];
  /** True when this entry came from inspecting one real tx, not a canonical source */
  provisional?: boolean;
  /**
   * True for bots whose fee-destination address changes per trade/referrer
   * (no fixed address is possible, or the known list is incomplete). scan.ts
   * detects these by summing every native SOL transfer OUT of the wallet in
   * any tx that touches one of `programIds`, as long as it wasn't already
   * counted via a known address — see the Axiom comment above for the caveat.
   */
  programOnly?: boolean;
}

export function chainOf(bot: BotFeeWallets): Chain {
  return bot.chain ?? "solana";
}

/**
 * Known relay/landing-speed tip accounts (Jito, Astralane, etc.) — NOT bot
 * revenue, just payment for fast block inclusion. Every `programOnly`
 * detection pass excludes transfers to these, otherwise a tip riding inside
 * e.g. an Axiom transaction gets misattributed as Axiom's fee. Confirmed
 * 2026-09-17: astraubkDw81n4LuutSQ8uzHCv4BhPVhfvTcYv8SKC (Astralane Tip
 * Account, seen inside what looks like an Axiom-routed swap). Jito's own
 * canonical tip accounts (documented publicly, ~8 addresses) aren't in here
 * yet — add them if they start showing up misattributed too.
 */
export const INFRA_TIP_ADDRESSES = new Set<string>([
  "astraubkDw81n4LuutSQ8uzHCv4BhPVhfvTcYv8SKC",
]);

export const BOT_FEE_REGISTRY: Record<string, BotFeeWallets> = {
  trojan: {
    name: "Trojan",
    addresses: [
      "BBYXdwhqbCxVRVtnuMTTxh8biNisz3ZxsnHfr44jXytR",
      "9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco",
      "2jwHNxavSoMZMEDbT1eV9PcPt5dDcayCqM6MkgaPpmWQ",
      "GV4Bt6ehW5x5dqtaWAJBSnz8uum5Z2Rp9P2Tr5iVuQn5",
    ],
    programIds: ["troyXT7Ty3s2rjJe4bqWaroUrS4Fjd8rbHHNHxcACF4"],
    programOnly: true,
  },
  bonkbot: {
    name: "BonkBot",
    addresses: ["ZG98FUCjb8mJ824Gbs6RsgVmr1FhXb2oNiJHa2dwmPd"],
  },
  banana_gun: {
    name: "Banana Gun",
    addresses: [
      "8r2hZoDfk5hDWJ1sDujAi2Qr45ZyZw5EQxAXiMZWLKh2",
      "Cj297UauzMX64FU9dKJZRUBWszJ7tEWpVheasq4CfATV",
      "HKMh8nV3ysSofRi23LsfVGLGQKB415QAEfZT96kCcVj4",
      "7tQiiBdKoScWQkB1RmVuML7DBGnR31cuKPEtMM7Vy5SA",
      "4BBNEVRgrxVKv9f7pMNE788XM1tt379X9vNjpDH2KCL7",
      "47hEzz83VFR23rLTEeVm9A7eFzjJwjvdupPPmX3cePqF",
      "EMbqD9Y9jLXEa3RbCR8AsEW1kVa3EiJgDLVgvKh4qNFP",
      "Lk693UiTzQC4vobasRS1QGcYA9D6RGYLjHp1bWreQtM",
    ],
  },
  bloom: {
    name: "Bloom",
    addresses: ["7HeD6sLLqAnKVRuSfc1Ko3BSPMNKWgGTiWLKXJF31vKM"],
  },
  maestro: {
    name: "Maestro",
    addresses: [
      "FRMxAnZgkW58zbYcE7Bxqsg99VWpJh6sMP5xLzAWNabN",
      "MaestroUL88UBnZr3wfoN7hqmNWFi3ZYCGqZoJJHE36",
    ],
  },
  mevx: {
    name: "MevX",
    addresses: [
      "3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A",
      "BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ",
      "4Lpvp1q69SHentfYcMBUrkgvppeEx6ovHCSYjg4UYXiq",
    ],
  },
  unibot: {
    name: "Unibot",
    addresses: [
      "8FEE2ghpWPoxsypBLW87yyqmChjUbcZz41V7bzfiJqGF",
      "7Yr577ubghnmUTvFgB23iPw3FWReMt18WehCz2b2c9mV",
    ],
  },
  nova: {
    name: "Nova",
    addresses: ["noVaE91mUL5jTb8e9Vf6dqJdNPzJpEQ3uAdnQ8h4nVz"],
  },
  wifbot: {
    name: "WifBot",
    addresses: ["W1FCMFH3D7QeQcsNSTCMTpJ9BxQdk6VzeQMLJp2dNro"],
  },
  sol_trading_bot: {
    name: "Sol Trading Bot",
    addresses: [
      "HEPL5rTb6n1Ax6jt9z2XMPFJcDe9bSWvWQpsK7AMcbZg",
      "K1LRSA1DSoKBtC5DkcvnermRQ62YxogWSCZZPWQrdG5",
      "F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj",
      "96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb",
    ],
  },
  cswap: { name: "CSwap", addresses: ["CSWAP5SpPcVjvpsA1H2n2HjNjMsRaPnZuX8H8bVJN5wy"] },
  shuriken: { name: "Shuriken", addresses: ["9cSuF94JWPb1HQzWMcifJzkoggwAtfjsojcUqny5XuJy"] },
  readyswap: { name: "ReadySwap", addresses: ["FNKVZeufZY2me2netdgj44tnxqPK1p5GTJkFWukWFRsN"] },
  soul_sniper: { name: "Soul Sniper", addresses: ["6MgcmcZJXfyux7rRSsvjWaG8iegQ29KLxMtWHKoCZ7fn"] },
  sanji: { name: "Sanji", addresses: ["4E64WX4EARRMfHsvL4ZXbrbpiPcBUyrC62uawGofhdNN"] },
  tradewiz: { name: "TradeWiz", addresses: ["97VmzkjX9w8gMFS2RnHTSjtMEDbifGXBq9pgosFdFnM"] },
  sol_gun: { name: "SolGun", addresses: ["J3W8Bv948phnEYFCHaSF9CPxbsdRn2LFjBCUwC7Vo5AN"] },
  tirador: { name: "Tirador", addresses: ["3CicL2SZhjeZrMkQ4trT2di2RKaffovBADqHvRrYKsaJ"] },
  prophetbots: {
    name: "ProphetBots",
    addresses: [
      "55vkTc7nZoUQM92AfQG7T8bkNKD4TbWeBPRg8KjyUZre",
      "Hgckz7Sv8Q5grhLXxDFXGaJD6StPE7Yu8gz611nn1wKS",
    ],
  },
  pinkpunk: {
    name: "PinkPunk",
    addresses: [
      "38e4GH49TwjXn2yARvnHueAKvU2xREtuchQahMiz3w9G",
      "DShXwLqk6ZHZFtdzE8HMDsGJLhEvrxgRdB5K16V28arK",
    ],
  },
  pepe_boost: { name: "PepeBoost", addresses: ["G9PhF9C9H83mAjjkdJz4MDqkufiTPMJkx7TnKE1kFyCp"] },
  looter: { name: "Looter", addresses: ["3Pu1V4duyLyVpAJue1kLAfr74nGjQ3JDzj3aJjnoEXuL"] },
  jupbot: { name: "JupBot", addresses: ["H2mM9cXi42efgwkSzTRKMVaWHrqJJx1nzNdV1NxWaHjC"] },
  falcon: { name: "Falcon", addresses: ["DfkYw6zrr5cqzQHBTaXBsny54p5ip25CELUZ71hkS5LH"] },
  bitfoot: { name: "Bitfoot", addresses: ["BzmpLvrhZHKoXV7CW9F1AVPnie3hNh2JK3BRdHL4Zcya"] },
  autosnipe: { name: "AutoSnipe", addresses: ["CWEfC6fLi552zE2KFxhPiBAZUWdT78gMd8NGENik2zfE"] },
  magnum: {
    name: "Magnum",
    addresses: [
      "CPixcsP8LEMeUoavaHG3bdkywR8s4mZXNN3mYUgbXFev",
      "8dEe5BM7irAnHtJ6SSWwCRf7njgnyczS3jPrvJJs88U5",
    ],
  },
  alpha_dex: { name: "Alpha Dex", addresses: ["6qgwjhV2RQxcPffRdtQBTTEezRykQKXqhcDyv1z3r9tq"] },
  photon: {
    name: "Photon",
    addresses: [
      "JuJcyJeyRrHkAWvfLn8TYtqsCbjEEFepWbqc1gUZmDY",
      "GbH2v1qM9zPLYkFufqukdxzGFbrhFugmFwwazNjvvGP",
    ],
    programIds: [
      "HAAoKJrdTktFs7zcBkpvw9ebPdu4L7Wx1CDx2waia6hD",
      "BSfD6SHZigAfDWSjzD5Q41jw8LmKwtmjskPH9XW1mrRW",
    ],
    programOnly: true,
    provisional: true,
  },
  gmgn: {
    name: "GMGN",
    addresses: ["3t9EKmRiAUcQUYzTZpNojzeGP1KBAVEEbDNmy6wECQpK"],
    programIds: ["GMgnVFR8Jb39LoXsEVzb3DvBy3ywCmdmJquHUy1Lrkqb"],
    programOnly: true,
    provisional: true,
  },
  axiom: {
    name: "Axiom",
    addresses: [],
    programIds: ["FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9"],
    programOnly: true,
    provisional: true,
  },
};

/** Fast reverse lookup: address -> bot key, built once at module load. */
export const ADDRESS_TO_BOT: Record<string, string> = Object.fromEntries(
  Object.entries(BOT_FEE_REGISTRY).flatMap(([key, bot]) =>
    bot.addresses.map((addr) => [addr, key])
  )
);

export function lookupBot(address: string): BotFeeWallets | undefined {
  const key = ADDRESS_TO_BOT[address];
  return key ? BOT_FEE_REGISTRY[key] : undefined;
}
