-- register_company_and_profile (see 20260805050000_fix_register_company_and_profile.sql)
-- catches every exception with a bare `WHEN OTHERS -> SQLERRM`, so a
-- brand-new signup for an email that's already registered under a
-- DIFFERENT auth user id (profiles.email has its own UNIQUE constraint,
-- profiles_email_key -- live on the database, not tracked in any earlier
-- migration in this repo -- separate from the ON CONFLICT (id) handling
-- that migration added) surfaced as the raw, meaningless-to-a-user
-- Postgres text "duplicate key value violates unique constraint
-- \"profiles_email_key\"" straight in the signup form. Catching
-- unique_violation specifically and checking which constraint fired lets
-- the client (app/(marketing)/login/page.tsx) show "this email is already
-- registered, log in instead" and offer to switch to the login form,
-- instead of the raw error string.
CREATE OR REPLACE FUNCTION "public"."register_company_and_profile"(
  "p_user_id" "uuid",
  "p_full_name" "text",
  "p_email" "text",
  "p_company_name" "text",
  "p_abn" "text" DEFAULT NULL::"text",
  "p_acn" "text" DEFAULT NULL::"text"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_company_id uuid;
  v_constraint text;
BEGIN
  INSERT INTO public.companies (name, abn, acn, status)
  VALUES (p_company_name, p_abn, p_acn, 'active')
  RETURNING id INTO v_company_id;

  INSERT INTO public.profiles (
    id, full_name, email, active_company_id, role, is_active, is_admin
  ) VALUES (
    p_user_id, p_full_name, p_email, v_company_id, 'company_admin', true, true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    active_company_id = EXCLUDED.active_company_id,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active,
    is_admin = EXCLUDED.is_admin;

  INSERT INTO public.company_memberships (user_id, company_id, role)
  VALUES (p_user_id, v_company_id, 'company_admin')
  ON CONFLICT (user_id, company_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'company_id', v_company_id);
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'profiles_email_key' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'duplicate_email', 'error', 'An account with this email already exists.');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
