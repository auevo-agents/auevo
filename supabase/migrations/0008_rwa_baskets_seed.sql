-- Strategy baskets — RWA_SPEC.md Phase 7. baskets.holdings (jsonb,
-- 0003_rwa.sql) is not schema-enforced, and this is the first migration to
-- actually populate it, so it also fixes its concrete shape:
-- [{ "ticker": "<rwa_underlyings.ticker>", "targetWeight": <0..1, summing
-- to 1 across a basket> }] — keyed by ticker, not on-chain address, so a
-- basket's weights stay meaningful independent of which issuer's
-- tokenized version of a stock happens to be verified on this chain right
-- now (src/lib/rwa/baskets.ts resolves ticker -> verified rwa_tokens row
-- at request time). 0003_rwa.sql's own column comment ("[{token,
-- weight}]") predates any code that actually read this column — nothing
-- upstream depended on that exact shape.
--
-- targetWeight below is plain EQUAL weight within each basket, not a
-- weight sourced from any institutional-holdings filing. RWA_SPEC.md asks
-- for "веса из публичных 13F" — deliberately not attempted here: this
-- environment's network egress couldn't reach SEC EDGAR (or any 13F
-- aggregator) to pull and cite a real filing during this phase (see the
-- Phase 7 research this migration's sibling code changes are based on),
-- and typing plausible-looking institutional weights from memory would be
-- exactly the kind of invented number this project's own standing rule
-- forbids (see e.g. 0004_rwa_seed_underlyings.sql's own note on not
-- guessing ticker data). Equal weight is a real, defensible, commonly
-- used indexing methodology in its own right — not a placeholder pretending
-- to be something else — and every basket also exposes "equal"/"custom"
-- weight modes at buy time (src/lib/rwa/baskets.ts's BasketWeightMode), so
-- nothing here is locked in. Replacing targetWeight with real, cited
-- 13F-sourced numbers is expected follow-up work once this environment (or
-- a future one) can actually fetch and cite that data, not something this
-- migration claims to finish.
--
-- Every ticker below is already seeded in 0004_rwa_seed_underlyings.sql —
-- no new rwa_underlyings rows are added here, and no basket references a
-- ticker outside that list, so nothing here can reference a ticker with no
-- reference-price/category data at all.

insert into baskets (id, kind, name, description, chain_id, holdings, source, one_year_return) values
  (
    'mag7',
    'strategy',
    'Magnificent Seven',
    'Equal-weight basket of the seven mega-cap tech names commonly grouped as the "Magnificent Seven".',
    4663,
    '[
      {"ticker": "AAPL", "targetWeight": 0.142857},
      {"ticker": "MSFT", "targetWeight": 0.142857},
      {"ticker": "GOOGL", "targetWeight": 0.142857},
      {"ticker": "AMZN", "targetWeight": 0.142857},
      {"ticker": "NVDA", "targetWeight": 0.142857},
      {"ticker": "META", "targetWeight": 0.142858},
      {"ticker": "TSLA", "targetWeight": 0.142857}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'ai-chips',
    'strategy',
    'AI & Semiconductors',
    'Equal-weight basket of chipmakers/AI infrastructure names available in this catalog (NVIDIA, AMD, Taiwan Semiconductor, Broadcom).',
    4663,
    '[
      {"ticker": "NVDA", "targetWeight": 0.25},
      {"ticker": "AMD", "targetWeight": 0.25},
      {"ticker": "TSM", "targetWeight": 0.25},
      {"ticker": "AVGO", "targetWeight": 0.25}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'fintech-payments',
    'strategy',
    'Fintech & Payments',
    'Equal-weight basket of consumer fintech/payments names available in this catalog (Coinbase, Robinhood, JPMorgan, Visa, Mastercard).',
    4663,
    '[
      {"ticker": "COIN", "targetWeight": 0.2},
      {"ticker": "HOOD", "targetWeight": 0.2},
      {"ticker": "JPM", "targetWeight": 0.2},
      {"ticker": "V", "targetWeight": 0.2},
      {"ticker": "MA", "targetWeight": 0.2}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'broad-index-trackers',
    'strategy',
    'Broad Index Trackers',
    'Equal-weight basket of the two broad-market ETFs available in this catalog (S&P 500, Nasdaq-100).',
    4663,
    '[
      {"ticker": "SPY", "targetWeight": 0.5},
      {"ticker": "QQQ", "targetWeight": 0.5}
    ]'::jsonb,
    'auevo',
    null
  )
on conflict (id) do nothing;
