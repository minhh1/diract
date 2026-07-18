-- Distinguishes BYO virtual computers (company pays the cloud provider via
-- their own company_cloud_credentials row) from platform-billed ones (the
-- platform owns the cloud account; the company pays via its fixed monthly
-- Stripe subscription instead -- see company_subscriptions.sql).
-- Platform-billed rows have credential_id = NULL (already nullable) and
-- resolve credentials at runtime from platform env vars instead -- see
-- lib/vmProviders/platformCredentials.ts.
ALTER TABLE virtual_computers ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'byo'
  CHECK (billing_mode IN ('byo', 'platform'));
