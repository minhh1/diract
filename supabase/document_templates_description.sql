-- Optional admin-written explanation for a document template, shown to the
-- client on the fill-in link so they know what each document is for.
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS description text;
