SET request.jwt.claim.role = 'service_role';

-- Whether a demo hub masks dollar figures. Defaults to TRUE: a hub is a
-- link handed to someone outside the company, so the safe default is to
-- show the product's capability without its real numbers. Turning it off
-- is a deliberate act per hub.
--
-- Masking is presentational only and is applied per component
-- (MatterBoard's maskCurrency, BudgetVsActualTable's) -- the underlying
-- API responses still carry the values, so this is a demo affordance, NOT
-- a security control. Anything genuinely confidential should be kept off
-- the hub via excluded_keys rather than relying on this.
ALTER TABLE public_demo_hubs ADD COLUMN IF NOT EXISTS mask_figures boolean NOT NULL DEFAULT true;
