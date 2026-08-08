-- Extends register_company_and_profile with the new companies.country/
-- nzbn/ein/company_number/business_number columns (see the companion
-- migration 20260808040000_companies_country_identifiers.sql). All five
-- new params are optional/nullable and default to the same "AU, no
-- identifiers" shape existing callers already pass, so every current call
-- site (components/CreateCompanyModal.tsx, app/(marketing)/login/page.tsx,
-- app/(marketing)/for/law-firm-au/get-started/page.tsx, mobile/src/app/
-- sign-in.tsx) keeps working unchanged until each is updated to pass the
-- new ones. Everything else about this function (the auth.uid() check from
-- 20260806110000_register_company_auth_check.sql, the profiles/
-- company_memberships inserts, the exception handling) is untouched.
CREATE OR REPLACE FUNCTION "public"."register_company_and_profile"(
  "p_user_id" "uuid",
  "p_full_name" "text",
  "p_email" "text",
  "p_company_name" "text",
  "p_abn" "text" DEFAULT NULL::"text",
  "p_acn" "text" DEFAULT NULL::"text",
  "p_country" "text" DEFAULT 'AU'::"text",
  "p_nzbn" "text" DEFAULT NULL::"text",
  "p_ein" "text" DEFAULT NULL::"text",
  "p_company_number" "text" DEFAULT NULL::"text",
  "p_business_number" "text" DEFAULT NULL::"text"
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

  INSERT INTO public.companies (name, abn, acn, country, nzbn, ein, company_number, business_number, status)
  VALUES (p_company_name, p_abn, p_acn, COALESCE(p_country, 'AU'), p_nzbn, p_ein, p_company_number, p_business_number, 'active')
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
