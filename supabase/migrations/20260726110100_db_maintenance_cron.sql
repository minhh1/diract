-- Routine Postgres housekeeping. Autovacuum already runs ANALYZE
-- opportunistically, but an explicit monthly pass keeps planner stats
-- fresh on tables with bursty write patterns (sync workers, ledgers).
-- Weekly REINDEX CONCURRENTLY rebuilds bloated indexes without taking the
-- exclusive lock a plain REINDEX would -- writes keep working during it.
-- Both run as bare top-level statements (not wrapped in a plpgsql
-- function, unlike empty_records_sweep.sql) because REINDEX CONCURRENTLY
-- is not allowed inside a transaction block/function body.
--
-- Scheduled for ~3-4am AEST/AEDT (business hours for this company), not
-- literal UTC 3am which would land mid-afternoon in Australia.
SELECT cron.schedule(
  'monthly-analyze',
  '0 18 1 * *',
  $$ ANALYZE $$
);

SELECT cron.schedule(
  'weekly-reindex',
  '0 18 * * 0',
  $$ REINDEX SCHEMA CONCURRENTLY public $$
);
