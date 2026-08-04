-- Removes the per-company custom-table cap (companies.max_custom_tables,
-- default 10) entirely. Found live while testing the law-firm-au onboarding
-- wizard: a brand-new company installing the Law Firm template hits this
-- immediately (the template alone creates more than 10 tables), returning
-- "Custom table limit reached (10 tables). Upgrade your subscription to add
-- more." -- meaning no fresh self-signup could ever get the full template
-- it was just promised. Rather than special-casing the limit per template
-- (as supabase/migrations/20260731100000_trust_account_page.sql did once,
-- raising it to 20 for existing companies on that template), the limit is
-- removed outright per instruction.
DROP TRIGGER IF EXISTS "enforce_custom_table_limit" ON "public"."company_tables";
DROP FUNCTION IF EXISTS "public"."check_custom_table_limit"();
