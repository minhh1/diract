-- register_company_and_profile is a SECURITY DEFINER function that inserts/
-- overwrites a profiles row (full_name, email, active_company_id, role,
-- is_admin) for whatever p_user_id is passed in -- with NO check that the
-- caller actually IS that user. Every call site so far has happened to only
-- ever pass the caller's own freshly-signed-up id (app/(marketing)/login/page.tsx,
-- app/(marketing)/for/law-firm-au/get-started/page.tsx), so this was never
-- exploited, but the RPC is directly callable by any authenticated client
-- (supabase.rpc() has no server-side gate of its own) with an ARBITRARY
-- p_user_id -- letting any signed-in user overwrite another user's profile
-- (switch their active company, grant/revoke their admin flag, even their
-- name/email) just by knowing their id. Closing this before reusing the RPC
-- for a new "existing user creates another company" entry point
-- (components/CreateCompanyModal.tsx), which would otherwise make calling
-- it with a spoofed id an obvious thing to try. auth.uid() reads the
-- CALLING request's JWT regardless of SECURITY DEFINER (it isn't affected
-- by which role the function body runs as), so this doesn't need any
-- broader auth plumbing -- and every existing legitimate call already only
-- ever passes the caller's own id, so this can't break either of them.
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
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized.');
  END IF;

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
