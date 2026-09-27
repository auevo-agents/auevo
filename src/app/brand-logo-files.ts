/**
 * File-based brand marks — real logo assets the user supplied directly
 * (public/logos/*), not derived from a third-party icon package. Checked
 * before brand-marks.ts's inline-path table in brand-icon.tsx: a
 * user-provided asset is treated as the more authoritative/higher-fidelity
 * source when both exist for the same symbol (e.g. Ethereum's full-color
 * mark here replaces simple-icons' single-color one).
 *
 * Every key below is lowercase, matching BrandIcon's own lookup
 * (`table[symbol.toLowerCase()]`). Not every file here has a live match
 * in this app yet — some (cbbtc, tao, usdg, and a few less-common
 * tickers this session couldn't independently confirm the issuer for)
 * have no corresponding rwa_underlyings row, so they're simply unused
 * until/unless one is added — registering the asset isn't itself a claim
 * that the ticker is in the catalog.
 */

export const TICKER_LOGO_FILES: Record<string, string> = {
  aapl: "aapl.svg",
  amc: "amc.svg",
  amd: "amd.svg",
  amzn: "amzn.svg",
  ba: "ba.svg",
  baba: "baba.svg",
  bb: "bb.svg",
  be: "be.svg",
  bull: "bull.svg",
  cbbtc: "cbbtc.svg",
  ceg: "ceg.svg",
  coin: "coin.svg",
  cost: "cost.svg",
  crcl: "crcl.svg",
  dell: "dell.svg",
  djt: "djt.svg",
  ewy: "ewy.svg",
  f: "f.svg",
  fig: "fig.svg",
  gld: "gld.svg",
  gme: "gme.svg",
  googl: "googl.svg",
  hims: "hims.svg",
  ibm: "ibm.svg",
  inda: "inda.svg",
  intc: "intc.svg",
  jnj: "jnj.svg",
  lly: "lly.svg",
  lmt: "lmt.svg",
  lulu: "lulu.svg",
  meta: "meta.svg",
  mrna: "mrna.svg",
  mrvl: "mrvl.svg",
  msft: "msft.svg",
  mstr: "mstr.svg",
  mu: "mu.svg",
  net: "net.svg",
  nflx: "nflx.svg",
  nu: "nu.svg",
  nvda: "nvda.svg",
  orbio: "orbio.svg",
  pfe: "pfe.svg",
  pltr: "pltr.svg",
  qqq: "qqq.svg",
  qubt: "qubt.svg",
  rblx: "rblx.svg",
  rcat: "rcat.svg",
  rddt: "rddt.svg",
  rivn: "rivn.svg",
  rklb: "rklb.svg",
  sgov: "sgov.svg",
  shop: "shop.svg",
  shroom: "shroom.svg",
  skhy: "skhy.svg",
  slv: "slv.svg",
  snap: "snap.svg",
  sndk: "sndk.svg",
  snow: "snow.svg",
  spcx: "spcx.svg",
  spy: "spy.svg",
  tao: "tao.svg",
  tsla: "tsla.svg",
  tsm: "tsm.svg",
  ttwo: "ttwo.svg",
  ups: "ups.svg",
  usdg: "usdg.png",
  uso: "uso.svg",
  wyfi: "wyfi.svg",
};

export const CHAIN_LOGO_FILES: Record<string, string> = {
  ethereum: "ethereum.svg",
};

/**
 * xstocks.svg: xStocks' own site (xstocks.fi/docs.xstocks.fi) is blocked
 * by this environment's network egress policy, so the exact published
 * file couldn't be fetched byte-for-byte. Hand-vectorized instead from
 * their favicon as shown in a search result and their own published
 * brand-kit gradient (#1FD59A → #5FCEF0, confirmed via WebSearch of
 * docs.xstocks.fi/docs/media-and-brand-kit) — a faithful reproduction of
 * the mark's shape and exact colors, not a byte-identical copy of their
 * source file. Replace with the real asset if this environment ever gets
 * access to fetch it directly.
 */
export const ISSUER_LOGO_FILES: Record<string, string> = {
  xstocks: "xstocks.svg",
};
