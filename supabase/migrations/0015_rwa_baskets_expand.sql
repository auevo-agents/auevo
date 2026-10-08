-- Expands the Strategy basket catalog from 4 to 14 — same conventions as
-- 0008_rwa_baskets_seed.sql: equal weight within each basket (a real,
-- defensible indexing methodology in its own right, not a placeholder —
-- see that migration's own note on why 13F-sourced weights aren't used),
-- every ticker already seeded in rwa_underlyings (verified against a
-- live query before writing this), chain_id 4663 (Robinhood Chain), and
-- kind/source matching every existing row.

insert into baskets (id, kind, name, description, chain_id, holdings, source, one_year_return) values
  (
    'cloud-software',
    'strategy',
    'Cloud & Enterprise Software',
    'Equal-weight basket of enterprise cloud and software names available in this catalog (Microsoft, Oracle, Salesforce, Adobe, Snowflake).',
    4663,
    '[
      {"ticker": "MSFT", "targetWeight": 0.2},
      {"ticker": "ORCL", "targetWeight": 0.2},
      {"ticker": "CRM", "targetWeight": 0.2},
      {"ticker": "ADBE", "targetWeight": 0.2},
      {"ticker": "SNOW", "targetWeight": 0.2}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'healthcare-pharma',
    'strategy',
    'Healthcare & Pharma',
    'Equal-weight basket of major healthcare and pharmaceutical names available in this catalog (Johnson & Johnson, Pfizer, Eli Lilly, UnitedHealth, AbbVie, Moderna).',
    4663,
    '[
      {"ticker": "JNJ", "targetWeight": 0.166667},
      {"ticker": "PFE", "targetWeight": 0.166667},
      {"ticker": "LLY", "targetWeight": 0.166667},
      {"ticker": "UNH", "targetWeight": 0.166667},
      {"ticker": "ABBV", "targetWeight": 0.166667},
      {"ticker": "MRNA", "targetWeight": 0.166665}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'consumer-staples-retail',
    'strategy',
    'Consumer Staples & Retail',
    'Equal-weight basket of consumer staples and retail names available in this catalog (Walmart, Costco, Procter & Gamble, Coca-Cola, PepsiCo, Home Depot).',
    4663,
    '[
      {"ticker": "WMT", "targetWeight": 0.166667},
      {"ticker": "COST", "targetWeight": 0.166667},
      {"ticker": "PG", "targetWeight": 0.166667},
      {"ticker": "KO", "targetWeight": 0.166667},
      {"ticker": "PEP", "targetWeight": 0.166667},
      {"ticker": "HD", "targetWeight": 0.166665}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'banks-financials',
    'strategy',
    'Banks & Financials',
    'Equal-weight basket of major US bank and financial-services names available in this catalog (JPMorgan, Bank of America, Wells Fargo, Goldman Sachs, Morgan Stanley).',
    4663,
    '[
      {"ticker": "JPM", "targetWeight": 0.2},
      {"ticker": "BAC", "targetWeight": 0.2},
      {"ticker": "WFC", "targetWeight": 0.2},
      {"ticker": "GS", "targetWeight": 0.2},
      {"ticker": "MS", "targetWeight": 0.2}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'crypto-proxies',
    'strategy',
    'Crypto & Digital Assets Proxies',
    'Equal-weight basket of publicly traded companies with direct crypto-market exposure available in this catalog (Coinbase, Robinhood, Strategy, Circle, Webull).',
    4663,
    '[
      {"ticker": "COIN", "targetWeight": 0.2},
      {"ticker": "HOOD", "targetWeight": 0.2},
      {"ticker": "MSTR", "targetWeight": 0.2},
      {"ticker": "CRCL", "targetWeight": 0.2},
      {"ticker": "BULL", "targetWeight": 0.2}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'media-entertainment',
    'strategy',
    'Media & Entertainment',
    'Equal-weight basket of media, streaming and social-platform names available in this catalog (Disney, Netflix, Take-Two, Reddit, Snap).',
    4663,
    '[
      {"ticker": "DIS", "targetWeight": 0.2},
      {"ticker": "NFLX", "targetWeight": 0.2},
      {"ticker": "TTWO", "targetWeight": 0.2},
      {"ticker": "RDDT", "targetWeight": 0.2},
      {"ticker": "SNAP", "targetWeight": 0.2}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'aerospace-defense',
    'strategy',
    'Aerospace & Defense',
    'Equal-weight basket of aerospace and defense names available in this catalog (Boeing, Lockheed Martin, Rocket Lab, GE Aerospace).',
    4663,
    '[
      {"ticker": "BA", "targetWeight": 0.25},
      {"ticker": "LMT", "targetWeight": 0.25},
      {"ticker": "RKLB", "targetWeight": 0.25},
      {"ticker": "GE", "targetWeight": 0.25}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'precious-metals',
    'strategy',
    'Precious Metals',
    'Equal-weight basket of gold- and silver-backed tokens and ETFs available in this catalog (PAX Gold, Tether Gold, SPDR Gold Shares, iShares Silver Trust).',
    4663,
    '[
      {"ticker": "PAXG", "targetWeight": 0.25},
      {"ticker": "XAUT", "targetWeight": 0.25},
      {"ticker": "GLD", "targetWeight": 0.25},
      {"ticker": "SLV", "targetWeight": 0.25}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'treasuries-private-credit',
    'strategy',
    'Treasuries & Private Credit',
    'Equal-weight basket of short-duration treasury and private-credit yield tokens available in this catalog (iShares 0-3 Month Treasury Bond ETF, Theo T-Bill, Syrup USDC, Syrup USDT).',
    4663,
    '[
      {"ticker": "SGOV", "targetWeight": 0.25},
      {"ticker": "thBILL", "targetWeight": 0.25},
      {"ticker": "syrupUSDC", "targetWeight": 0.25},
      {"ticker": "syrupUSDT", "targetWeight": 0.25}
    ]'::jsonb,
    'auevo',
    null
  ),
  (
    'ev-mobility',
    'strategy',
    'EV & Mobility',
    'Equal-weight basket of electric-vehicle and mobility names available in this catalog (Tesla, Rivian, Ford, Uber).',
    4663,
    '[
      {"ticker": "TSLA", "targetWeight": 0.25},
      {"ticker": "RIVN", "targetWeight": 0.25},
      {"ticker": "F", "targetWeight": 0.25},
      {"ticker": "UBER", "targetWeight": 0.25}
    ]'::jsonb,
    'auevo',
    null
  )
on conflict (id) do nothing;
