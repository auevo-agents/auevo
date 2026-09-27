-- Widens 0004_rwa_seed_underlyings.sql's starter set — that migration's
-- own comment already flagged "growing this list ... is expected
-- follow-up work". Discovery on both sources this app reads (the
-- Robinhood Chain v4-pool scan in run-registry.ts, and the xStocks
-- cross-chain tokenlist in xstocks.ts) is gated on a ticker already
-- existing in rwa_underlyings — a real, on-chain token for a company not
-- in this table is simply invisible to either source, not excluded on
-- purpose. This adds another batch of large, extremely well-known
-- US-listed names and popular ETFs, same "confidently known without
-- needing to look anything up" bar the original seed used — still not
-- the full ~1,092-ticker xStocks universe, which needs real per-ticker
-- verification (name/category/exchange), not typing from memory.

insert into rwa_underlyings (ticker, name, category, exchange, reference_source) values
  ('BRK.B', 'Berkshire Hathaway Inc. (Class B)', 'stock', 'NYSE', 'twelvedata'),
  ('JNJ', 'Johnson & Johnson', 'stock', 'NYSE', 'twelvedata'),
  ('WMT', 'Walmart Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('PG', 'The Procter & Gamble Company', 'stock', 'NYSE', 'twelvedata'),
  ('XOM', 'Exxon Mobil Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('CVX', 'Chevron Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('KO', 'The Coca-Cola Company', 'stock', 'NYSE', 'twelvedata'),
  ('PEP', 'PepsiCo, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('DIS', 'The Walt Disney Company', 'stock', 'NYSE', 'twelvedata'),
  ('BAC', 'Bank of America Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('WFC', 'Wells Fargo & Company', 'stock', 'NYSE', 'twelvedata'),
  ('GS', 'The Goldman Sachs Group, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('MS', 'Morgan Stanley', 'stock', 'NYSE', 'twelvedata'),
  ('INTC', 'Intel Corporation', 'stock', 'NASDAQ', 'twelvedata'),
  ('QCOM', 'QUALCOMM Incorporated', 'stock', 'NASDAQ', 'twelvedata'),
  ('CSCO', 'Cisco Systems, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('ADBE', 'Adobe Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('UBER', 'Uber Technologies, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('ABNB', 'Airbnb, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('SHOP', 'Shopify Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('SBUX', 'Starbucks Corporation', 'stock', 'NASDAQ', 'twelvedata'),
  ('MCD', 'McDonald''s Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('NKE', 'NIKE, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('BA', 'The Boeing Company', 'stock', 'NYSE', 'twelvedata'),
  ('GE', 'GE Aerospace', 'stock', 'NYSE', 'twelvedata'),
  ('IBM', 'International Business Machines Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('T', 'AT&T Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('VZ', 'Verizon Communications Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('UNH', 'UnitedHealth Group Incorporated', 'stock', 'NYSE', 'twelvedata'),
  ('HD', 'The Home Depot, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('LLY', 'Eli Lilly and Company', 'stock', 'NYSE', 'twelvedata'),
  ('ABBV', 'AbbVie Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('XLK', 'Technology Select Sector SPDR Fund', 'etf', 'NYSEARCA', 'twelvedata'),
  ('VOO', 'Vanguard S&P 500 ETF', 'etf', 'NYSEARCA', 'twelvedata'),
  ('IWM', 'iShares Russell 2000 ETF', 'etf', 'NYSEARCA', 'twelvedata'),
  ('GLD', 'SPDR Gold Shares', 'etf', 'NYSEARCA', 'twelvedata'),
  ('ARKK', 'ARK Innovation ETF', 'etf', 'NYSEARCA', 'twelvedata'),
  ('DIA', 'SPDR Dow Jones Industrial Average ETF Trust', 'etf', 'NYSEARCA', 'twelvedata')
on conflict (ticker) do nothing;
