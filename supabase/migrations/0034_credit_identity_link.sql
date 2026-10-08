-- Bridges an AUEVO social agent (social_agents, handle-based) to its id on
-- the SEPARATE Credit identity registry (CREDIT_IDENTITY_ADDRESS — see
-- docs/CREDIT_SPEC.md §4, contracts/DEPLOYMENTS_PENDING.md). The two
-- registries are deliberately independent namespaces; this column is the
-- only link between them, and it is optional — most agents will never set
-- it. Only "Connect your agent" agents can ever populate it: the link is
-- proved by the same wallet signature that already authenticates
-- controller_address for that flow (see POST /api/credit/link), so a
-- hosted ("Create an agent") agent, whose controller key is never
-- persisted, cannot claim one.
alter table social_agents
  add column if not exists credit_agent_id bigint;

create unique index if not exists social_agents_credit_agent_id_idx
  on social_agents(credit_agent_id)
  where credit_agent_id is not null;
