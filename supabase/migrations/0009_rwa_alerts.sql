-- RWA_SPEC.md Phase 8's alerts: "subscribe to premium > X, a new ticker
-- listing, a large trade" + "web notifications + a Telegram bot". The
-- `alerts` table itself (subscriptions) already exists from 0003_rwa.sql;
-- this adds what was missing to actually fire and deliver them.

-- Records of a subscription actually firing — separate from `alerts`
-- (the subscription itself) so an alert's own row never needs updating
-- just because it fired again, and so the web UI has a real feed to
-- render ("web notifications" here means an in-app notification list a
-- connected wallet can read, not a browser Push API subscription — this
-- app has no service worker infra, and Vercel's Hobby-plan cron limit
-- (once daily — see vercel.json's own history) already caps how
-- "live" any alert here can be regardless of delivery mechanism).
create table if not exists alert_notifications (
  id bigserial primary key,
  alert_id bigint not null references alerts (id) on delete cascade,
  message text not null,
  -- Prevents re-firing the same underlying event every single daily
  -- pass (e.g. a premium that's still above threshold the next day
  -- fires once per day it crosses, keyed by date; a whale trade fires
  -- once per tx_hash; a new listing fires once per token address).
  dedupe_key text not null,
  delivered_web boolean not null default false,
  delivered_telegram boolean not null default false,
  fired_at timestamptz not null default now(),
  unique (alert_id, dedupe_key)
);

create index if not exists alert_notifications_alert_idx on alert_notifications (alert_id, fired_at desc);

-- One Telegram chat per wallet account. link_code/link_code_expires_at
-- are only populated while a link is pending (the code is one-time,
-- short-lived, and cleared once /start on the bot resolves it — see
-- api/telegram/webhook's own handler).
create table if not exists telegram_links (
  account text primary key,
  chat_id bigint unique,
  link_code text unique,
  link_code_expires_at timestamptz,
  linked_at timestamptz
);

-- Same locked-down posture as `alerts`/`app_transfers`: per-user data,
-- enabled with zero policies, read/written only via the service-role
-- key from server-side API routes.
alter table alert_notifications enable row level security;
alter table telegram_links enable row level security;
