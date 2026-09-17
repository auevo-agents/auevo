/**
 * Registry of known Solana trading-bot fee-collector wallet addresses.
 *
 * Source for the confirmed entries: github.com/duneanalytics/spellbook,
 * dbt_subprojects/solana/models/_sector/dex/bot_trades/solana/platforms/*.sql
 * — these are the hardcoded `fee_receiver` constants Dune's own production
 * indexing models use to detect each bot's trades. Checked 2026-09-17.
 *
 * Bots that route fees through their own on-chain program instead of a
 * fixed wallet (Axiom, BullX, Photon, GMGN) are NOT detectable this way —
 * see docs/fee-detection.md for why, and lib/bot-fees-program.ts (TODO)
 * for the program-ID based approach those need.
 */

export interface BotFeeWallets {
  /** Display name shown to the user */
  name: string;
  /** One or more fee-collector wallet addresses (some bots rotate/load-balance) */
  addresses: string[];
}

export const BOT_FEE_REGISTRY: Record<string, BotFeeWallets> = {
  trojan: {
    name: "Trojan",
    addresses: [
      "BBYXdwhqbCxVRVtnuMTTxh8biNisz3ZxsnHfr44jXytR",
      "9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco",
    ],
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
