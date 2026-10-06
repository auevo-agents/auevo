-- Starter set of rwa_underlyings — RWA_SPEC.md phase 1's "seed ... baseline
-- tickers". Deliberately NOT the full ~1,092-ticker universe xStocks'
-- own live token list covers (github.com/backed-fi/cowswap-xstocks-
-- tokenlist, fetched 2026-09-26) — hand-verifying the correct company
-- name/category/exchange for over a thousand tickers, many of them non-US
-- listings represented with unfamiliar suffixes in that list (e.g.
-- "BA.GB"), isn't something to do by typing them out from memory. This is
-- a starter set of names confidently known without needing to look
-- anything up (Mag7 plus a handful of other widely-tokenized names,
-- spanning both categories this app currently seeds: stock and etf).
-- Growing this list with verified data (real exchange listings, not
-- guesses) is expected follow-up work, not something this migration
-- claims to finish.
--
-- reference_source is 'twelvedata' for all of these — the one provider
-- src/lib/rwa/reference-price.ts actually implements right now (see its
-- own doc comment on why Chainlink isn't wired yet). Premium won't
-- compute for any of them until REFERENCE_PRICE_API_KEY is set; that's
-- the intended "no source configured yet" state, not a bug.

insert into rwa_underlyings (ticker, name, category, exchange, reference_source) values
  ('NVDA', 'NVIDIA Corporation', 'stock', 'NASDAQ', 'twelvedata'),
  ('TSLA', 'Tesla, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('AAPL', 'Apple Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('MSFT', 'Microsoft Corporation', 'stock', 'NASDAQ', 'twelvedata'),
  ('GOOGL', 'Alphabet Inc. (Class A)', 'stock', 'NASDAQ', 'twelvedata'),
  ('AMZN', 'Amazon.com, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('META', 'Meta Platforms, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('TSM', 'Taiwan Semiconductor Manufacturing Company (ADR)', 'stock', 'NYSE', 'twelvedata'),
  ('AMD', 'Advanced Micro Devices, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('NFLX', 'Netflix, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('COIN', 'Coinbase Global, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('PLTR', 'Palantir Technologies Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('HOOD', 'Robinhood Markets, Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('AVGO', 'Broadcom Inc.', 'stock', 'NASDAQ', 'twelvedata'),
  ('CRM', 'Salesforce, Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('ORCL', 'Oracle Corporation', 'stock', 'NYSE', 'twelvedata'),
  ('JPM', 'JPMorgan Chase & Co.', 'stock', 'NYSE', 'twelvedata'),
  ('V', 'Visa Inc.', 'stock', 'NYSE', 'twelvedata'),
  ('MA', 'Mastercard Incorporated', 'stock', 'NYSE', 'twelvedata'),
  ('SPY', 'SPDR S&P 500 ETF Trust', 'etf', 'NYSEARCA', 'twelvedata'),
  ('QQQ', 'Invesco QQQ Trust', 'etf', 'NASDAQ', 'twelvedata')
on conflict (ticker) do nothing;
