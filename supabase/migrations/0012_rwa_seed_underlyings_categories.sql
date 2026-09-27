-- Fills in the three rwa_underlyings.category values (0003_rwa.sql's own
-- check constraint already allows 'commodity', 'treasury', 'private_credit')
-- that had zero seeded tickers — every underlying seeded so far
-- (0004/0011) was 'stock' or 'etf'. The tickers below aren't new research:
-- each one is the exact token 0003_rwa.sql's own rwa_issuers seed already
-- names in that issuer's backing_note (XAUT/Tether, PAXG/Paxos,
-- syrupUSDC+syrupUSDT/Maple, thBILL/Theo) — this migration just gives
-- those already-documented tokens a row in the underlying catalog, since
-- discovery on both registry sources (run-registry.ts's v4-pool scan,
-- xstocks.ts's tokenlist) is gated on the ticker already existing here.
--
-- reference_source is left null for all five: none of them are a plain
-- equity/ETF ticker Twelve Data's /price endpoint resolves by symbol, and
-- reference-price.ts's own rule is "no source configured -> null, never
-- guess" — same posture as any other unmapped ticker already in this
-- table, not a regression.

insert into rwa_underlyings (ticker, name, category, exchange, reference_source) values
  ('XAUT', 'Tether Gold', 'commodity', null, null),
  ('PAXG', 'PAX Gold', 'commodity', null, null),
  ('thBILL', 'Theo T-Bill', 'treasury', null, null),
  ('syrupUSDC', 'Syrup USDC', 'private_credit', null, null),
  ('syrupUSDT', 'Syrup USDT', 'private_credit', null, null)
on conflict (ticker) do nothing;
