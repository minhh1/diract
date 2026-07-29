-- Notifies existing company admins whenever a new company_memberships row
-- appears -- i.e. whenever someone joins, regardless of which of the 5
-- separate invite-accept code paths wrote it (app/login/page.tsx has 3,
-- app/auth/callback/route.ts has 1, the mobile app's
-- mobile/src/lib/inviteJoin.ts has another) -- same reasoning as the
-- existing task_assigned trigger: too many scattered writers for an
-- app-layer call site to be reliable, so the DB row itself is the
-- chokepoint.
CREATE OR REPLACE FUNCTION notify_team_member_joined()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT COALESCE(full_name, email) INTO v_name FROM profiles WHERE id = NEW.user_id;
  PERFORM notify_company_admins(
    NEW.company_id,
    'team_member_joined',
    COALESCE(v_name, 'A new team member') || ' joined your company',
    NULL,
    '/dashboard/admin?tab=members',
    'company_memberships',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_team_member_joined ON company_memberships;
CREATE TRIGGER trg_notify_team_member_joined
  AFTER INSERT ON company_memberships
  FOR EACH ROW EXECUTE FUNCTION notify_team_member_joined();
