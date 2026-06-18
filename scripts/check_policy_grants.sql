-- Recurrence guard for the "RLS policy without table GRANT = 42501" bug class.
-- Run in the Supabase SQL editor (or CI with a DB connection). Returns rows = FAIL:
-- any snrpmo table that has a SELECT/ALL RLS policy but no SELECT grant to authenticated.
-- Expected result: 0 rows (the 7 RPC-only tables are excluded by design).
select t.tablename as table_missing_select_grant
from pg_tables t
where t.schemaname = 'snrpmo'
  and exists (
    select 1 from pg_policies p
    where p.schemaname = 'snrpmo' and p.tablename = t.tablename and p.cmd in ('SELECT','ALL')
  )
  and not has_table_privilege('authenticated', 'snrpmo.'||t.tablename, 'SELECT')
  and t.tablename not in (
    -- intentionally RPC-only / service-role-only (no direct client read):
    'budgets','campaign_events','coa_templates','platform_campaigns',
    'platform_support_agents','recognition_runs','user_email_accounts',
    -- secret tables (RLS-on/no-policy lockdown):
    'backup_secret','billing_config','email_config','email_outbox','user_email_oauth_state'
  )
order by t.tablename;
