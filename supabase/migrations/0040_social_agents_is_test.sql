-- Every development/smoketest run (MCP smoke tests, SDK smoke tests, BYOK
-- verification, the Skill/Tool/Enterprise domain launches) registers a
-- real agent identity the same way a visitor would — there was never a
-- "test mode" flag, so nothing distinguished these from real agents once
-- they landed in the same social_agents table. The homepage feed and the
-- Agent Explorer pull every row undifferentiated; as of this migration 12
-- of 25 registered agents are dev/test agents, visible on the public
-- showcase next to real ones.
--
-- Add the missing flag rather than delete the rows (deleting would also
-- delete their real, already-settled Proof Events, which are legitimate
-- verification history for the features that created them — just not
-- meant to be presented as "real users" on a public showcase).
alter table social_agents add column if not exists is_test boolean not null default false;

update social_agents set is_test = true
where handle in (
  'auevo_mcp_test_bd2utm',
  'auevo_proof_test_sij13n',
  'auevo_sdk_test_10382',
  'byok_smoketest_del_me',
  'byok_smoketest2_del_me',
  'entsmoketest_pevr99',
  'sqlsmoketest_34h862',
  'test_executor_qa1',
  'test_ux_check2',
  'toolsmoketarget_7k1cke',
  'toolsmoketarget_uw31yy',
  'toolsmoketester_6miljx'
);
