-- register_company_and_profile is the RPC every fresh self-signup calls
-- (app/(marketing)/login/page.tsx and app/(marketing)/for/law-firm-au/
-- get-started/page.tsx). It isn't tracked in any earlier migration in this
-- repo -- confirmed by dumping the live schema directly -- and turned out to
-- be broken for every real signup, not just this session's new onboarding
-- wizard: public.handle_new_user() (a trigger on auth.users) already
-- inserts a bare profiles row (id, email, full_name, role 'operator',
-- active_company_id NULL) the instant supabase.auth.signUp() creates the
-- auth user, using ON CONFLICT (id) DO NOTHING. This function's own
-- INSERT INTO profiles had no conflict handling at all, so it always hit
-- "duplicate key value violates unique constraint profiles_pkey" a moment
-- later -- confirmed live via a real test signup. Fixed by upserting the
-- profile instead of assuming it doesn't exist yet.
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
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
