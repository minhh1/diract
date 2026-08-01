SET request.jwt.claim.role = 'service_role';

-- Server-side redaction of dollar figures on a shared page.
--
-- Replaces an earlier client-side masking pass that only hid figures in
-- the rendered output: the API responses still carried the real values, so
-- anyone who opened dev tools could read them. That is a demo affordance,
-- not confidentiality. With this flag the server strips currency values
-- BEFORE they leave, so the browser never receives them at all.
--
-- Deliberately a column on the PAGE rather than a request parameter: a
-- flag the client sends can simply be removed by the viewer, which would
-- make the whole thing decorative again. The page decides, not the caller.
--
-- Defaults to false so existing client/staff links are untouched; it is
-- turned on for pages that are being shown to a prospect.
ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS redact_figures boolean NOT NULL DEFAULT false;
ALTER TABLE finance_model_pages ADD COLUMN IF NOT EXISTS redact_figures boolean NOT NULL DEFAULT false;
