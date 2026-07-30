-- Lets the admin generating an invite link pick the role the invitee joins
-- with (Operator or Company Admin), instead of every invite always landing
-- as Operator with a manual promote-after-join step. All three accept-invite
-- code paths (app/auth/callback/route.ts, app/api/join-company/route.ts,
-- app/login/page.tsx) read this to set company_memberships.role instead of
-- hardcoding it.
alter table registration_tokens
  add column if not exists role text not null default 'operator'
    check (role in ('operator', 'company_admin'));
