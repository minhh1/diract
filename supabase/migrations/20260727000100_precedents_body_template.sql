-- Auto-detected body template for a precedent (see
-- lib/precedents/bodyTemplateDetect.ts), built from its precedent_body_examples.
-- A plain nullable jsonb column, same shape of decision as
-- company_letterheads.detected_fields -- this is a 1:1 relationship with
-- precedents so no separate table is warranted. NULL means no examples have
-- been processed yet; the Issue modal falls back to a freeform Body exactly
-- as it always has.
--
-- Shape: { segments: Array<
--   { type: 'text', text: string } |
--   { type: 'field', key: string, label: string, example: string }
-- > }

ALTER TABLE precedents ADD COLUMN IF NOT EXISTS body_template jsonb;
