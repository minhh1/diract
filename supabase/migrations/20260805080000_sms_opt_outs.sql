SET request.jwt.claim.role = 'service_role';

-- Platform-wide SMS suppression list -- deliberately NOT scoped by
-- company_id. Every company sends through the same single Diract-owned
-- Twilio number (see lib/sms/sendMessage.ts's header comment), so a
-- recipient has no way to know which tenant texted them; a STOP reply is
-- opting out of messages from THAT NUMBER, not from one company. One shared
-- list every tenant's send path checks, not a per-company one.
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  phone_number text PRIMARY KEY,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  -- 'stop_reply' (app/api/sms/inbound/route.ts) or 'manual' (an admin
  -- action) -- no other sources today.
  source text NOT NULL DEFAULT 'stop_reply' CHECK (source IN ('stop_reply', 'manual'))
);

ALTER TABLE sms_opt_outs ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated company member -- every tenant's send path
-- needs to check this before sending. No client INSERT/UPDATE/DELETE policy
-- at all: only the inbound webhook (service-role) and a future admin route
-- write to it.
DROP POLICY IF EXISTS sms_opt_outs_read ON sms_opt_outs;
CREATE POLICY sms_opt_outs_read ON sms_opt_outs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
