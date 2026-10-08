-- Widens the underlying catalog again, prompted by a batch of real logo
-- assets the user supplied directly (public/logos/) for tickers this
-- catalog didn't have yet. Same bar as 0004/0011's own seeds: large,
-- unambiguous, well-known public companies/ETFs, confidently known
-- without needing to look anything up. A few tickers from that same logo
-- batch are deliberately left out of this migration (their logo file is
-- still registered in brand-logo-files.ts, just unused for now):
-- SPCX (SpaceX isn't public — no real tokenized-equity product for it is
-- confirmed here), CBBTC/TAO (wrapped-crypto and a crypto-native token,
-- not a tokenized *stock* — this table's category constraint has no
-- crypto bucket and forcing one in would misclassify it), USDG (this
-- app's own quote asset, not a tradeable underlying), and SHROOM/WYFI/
-- SKHY/ORBIO (this session isn't confident which real company each
-- ticker refers to).

insert into rwa_underlyings (ticker, name, category, exchange, reference_source) values
  ('MRNA', 'Moderna, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('RIVN', 'Rivian Automotive, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('RKLB', 'Rocket Lab Corporation', 'stock', 'NASDAQ', 'twelvedata'),
  ('SNOW', 'Snowflake Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('HIMS', 'Hims & Hers Health, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('LULU', 'Lululemon Athletica Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('RDDT', 'Reddit, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('DELL', 'Dell Technologies Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('TTWO', 'Take-Two Interactive Software, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('LMT', 'Lockheed Martin Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('CEG', 'Constellation Energy Corporation', 'stock', 'NASDAQ', 'twelvedata'),
  ('MU', 'Micron Technology, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('PFE', 'Pfizer Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('BABA', 'Alibaba Group Holding Limited', 'stock', 'NYSE', 'twelvedata'),
  ('F', 'Ford Motor Company', 'stock', 'NYSE', 'twelvedata'),
  ('MSTR', 'Strategy Inc. (formerly MicroStrategy)', 'stock', 'NASDAQ', 'twelvedata'),
  ('COST', 'Costco Wholesale Corporation', 'stock', 'NASDAQ', 'twelvedata'),
  ('TSM', 'Taiwan Semiconductor Manufacturing Company Limited', 'stock', 'NYSE', 'twelvedata'),
  ('NU', 'Nu Holdings Ltd.', 'stock', 'NYSE', 'twelvedata'),
  ('BB', 'BlackBerry Limited', 'stock', 'NYSE', 'twelvedata'),
  ('SNDK', 'Sandisk Corporation', 'stock', 'NASDAQ', 'twelvedata'),
  ('DJT', 'Trump Media & Technology Group Corp.', 'stock', 'NASDAQ', 'twelvedata'),
  ('GME', 'GameStop Corp.', 'stock', 'NYSE', 'twelvedata'),
  ('SNAP', 'Snap Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('RCAT', 'Red Cat Holdings, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('AMC', 'AMC Entertainment Holdings, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('NET', 'Cloudflare, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('CRCL', 'Circle Internet Group, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('BULL', 'Webull Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('FIG', 'Figma, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('BE', 'Bloom Energy Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('QUBT', 'Quantum Computing Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('SGOV', 'iShares 0-3 Month Treasury Bond ETF', 'etf', 'NYSEARCA', 'twelvedata'),
  ('EWY', 'iShares MSCI South Korea ETF', 'etf', 'NYSEARCA', 'twelvedata'),
  ('INDA', 'iShares MSCI India ETF', 'etf', 'NYSEARCA', 'twelvedata'),
  ('SLV', 'iShares Silver Trust', 'etf', 'NYSEARCA', 'twelvedata'),
  ('USO', 'United States Oil Fund, LP', 'etf', 'NYSEARCA', 'twelvedata')
on conflict (ticker) do nothing;
