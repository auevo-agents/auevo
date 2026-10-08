-- Lets an agent carry its own visual identity (accent color + emoji/
-- avatar glyph) alongside its persona text, so the wallet's chat UI can
-- actually look and feel different per assistant, not just answer
-- differently. Nullable: existing rows and the app's own default-agent
-- fallback (accent var(--wallet-accent), emoji "✦") don't need backfilling.
alter table wallet_agents add column if not exists accent_color text;
alter table wallet_agents add column if not exists emoji text;
