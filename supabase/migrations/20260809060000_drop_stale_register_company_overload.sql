SET request.jwt.claim.role = 'service_role';

-- 20260808050000_register_company_country_identifiers.sql's CREATE OR
-- REPLACE FUNCTION added 5 new trailing params (p_country/p_nzbn/p_ein/
-- p_company_number/p_business_number) -- Postgres only replaces a function
-- when the parameter TYPE LIST matches exactly, so a changed arity creates
-- a second, separate overload instead of actually replacing the original
-- 6-param one. Left both signatures live in the database ever since,
-- confirmed live: calling the RPC with a partial param set that could
-- satisfy either overload's defaults now fails PostgREST's overload
-- resolution outright ("Could not choose the best candidate function").
-- The one real remaining caller of the OLD 6-param shape was
-- app/(marketing)/for/law-firm-au/get-started/page.tsx, already updated
-- (same commit as the country-identifiers feature) to also pass
-- p_country -- a param only the NEW overload has, so it was never actually
-- ambiguous in practice for that real call site. No caller anywhere in the
-- app (web or mobile) still needs the old 6-param shape to exist
-- separately.
DROP FUNCTION IF EXISTS public.register_company_and_profile(uuid, text, text, text, text, text);
