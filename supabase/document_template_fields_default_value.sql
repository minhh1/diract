-- Admin-specified fallback text for a field, used when the client leaves it
-- blank and it isn't auto-filled from project data or marked "Not applicable".
ALTER TABLE document_template_fields ADD COLUMN IF NOT EXISTS default_value text;
