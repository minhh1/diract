-- Fixes the on_auth_user_created trigger, which still inserted into
-- profiles.company_id -- a column that no longer exists (profiles now uses
-- active_company_id, set later once a user joins/creates a company). The
-- stale INSERT always raised an error, silently swallowed by the trigger's
-- own EXCEPTION handler, so every new signup got an auth.users row but NO
-- profiles row at all -- discovered while creating a throwaway auth user
-- directly via the Admin API for trash-feature testing.
--
-- App code (app/auth/callback/route.ts, app/login/page.tsx) already
-- upserts a profiles row itself after OAuth/email signup, which is why
-- this went unnoticed for normal signups -- but any other path that
-- creates an auth user directly (Admin API, a future signup flow) would
-- silently end up with no profile.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active, active_company_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    'operator',
    true,
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RETURN new;
END;
$$;
