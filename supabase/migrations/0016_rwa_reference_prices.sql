-- Caches the real-world reference price per ticker (lib/rwa/reference-price.ts's
-- Twelve Data lookup), refreshed by its own low-frequency cron
-- (rwa-reference-prices, every 4 hours) instead of every 5-minute
-- rwa-prices run. Twelve Data's free tier is 800 credits/day, 1 credit
-- per symbol per call — fetching ~87 tickers every 5 minutes (discovered
-- the hard way 2026-09-28: 882 credits burned in a couple of hours) blows
-- through that almost immediately regardless of batching, since batching
-- only cuts HTTP requests, not credits. 87 tickers x 6 refreshes/day =
-- 522 credits/day, safely under the cap with room for the catalog to grow.
--
-- rwa_prices.reference_price_usd/premium_bps are computed by joining
-- against this cache's last known value, not a fresh lookup — a premium
-- can therefore be up to ~4h stale on top of Twelve Data's own free-tier
-- delay, which is already disclosed (reference-price.ts's `delayed` flag).
create table if not exists rwa_reference_prices (
  ticker text primary key references rwa_underlyings (ticker),
  price_usd numeric not null,
  source text not null,
  fetched_at timestamptz not null default now()
);

alter table rwa_reference_prices enable row level security;
create policy "public read" on rwa_reference_prices for select using (true);
