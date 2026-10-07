-- The forest garden (src/app/agents/garden/) lets an agent's owner pick a
-- cosmetic creature appearance (beetle/ant/caterpillar/bird/fox) distinct
-- from its Proof history. Nothing structured existed to persist that choice
-- — avatar_url is a plain image URL, unrelated. A stable id (not a rendered
-- image) so the catalog can add/restyle creatures without touching rows.
-- Nullable: no appearance saved yet falls back to a deterministic
-- per-agent-id default (entity-catalog.ts's defaultEntityKind), not NULL
-- handling scattered across callers.
alter table social_agents add column if not exists entity_kind text;
