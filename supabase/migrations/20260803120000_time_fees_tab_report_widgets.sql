-- Existing per-matter "Time & Fees" record tabs (custom_dashboard, linked to
-- the time-fee-entries table) were seeded with a quick_add_form + raw grid.
-- The grid isn't useful on its own (same reasoning as hiding the raw table
-- from Sidebar/AddTabModal, see TRUST_PAGE_MANAGED_SLUGS) -- replace it with
-- the Time & Fees / Old Time report widgets instead (both already
-- automatically scope to just this matter, since RecordDashboardTab.tsx
-- pre-filters allRecords before the widgets ever see it). Keep the
-- quick_add_form as-is -- manual time entry against this matter stays.
-- Going forward this is handled by
-- lib/dashboardWidgets/defaultRecordDashboardTabs.ts's
-- reportWidgetsInsteadOfGrid flag; this is a one-time backfill for tabs that
-- already existed before that change.

update record_tabs
set title = 'Time & Fees Report'
where tab_type = 'custom_dashboard'
  and title = 'Time & Fees'
  and linked_table_id in (select id from company_tables where slug = 'time-fee-entries');

with kept as (
  select rtw.tab_id, jsonb_agg(w) as kept_widgets,
    coalesce(max((w->'layout'->>'y')::int + (w->'layout'->>'h')::int), 0) as next_y
  from record_tab_dashboard_widgets rtw
  join record_tabs rt on rt.id = rtw.tab_id
  cross join lateral jsonb_array_elements(rtw.widgets) w
  where rt.tab_type = 'custom_dashboard'
    and rt.linked_table_id in (select id from company_tables where slug = 'time-fee-entries')
    and w->>'type' = 'quick_add_form'
  group by rtw.tab_id
)
update record_tab_dashboard_widgets rtw
set widgets = kept.kept_widgets || jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text, 'type', 'time_fees_report', 'config', '{}'::jsonb,
      'layout', jsonb_build_object('x', 0, 'y', kept.next_y, 'w', 12, 'h', 8)
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text, 'type', 'time_aging_report', 'config', jsonb_build_object('agingDays', 30),
      'layout', jsonb_build_object('x', 0, 'y', kept.next_y + 8, 'w', 12, 'h', 8)
    )
  ),
  updated_at = now()
from kept
where rtw.tab_id = kept.tab_id;
