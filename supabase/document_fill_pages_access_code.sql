-- Optional short access code required before a client can view/submit a
-- document_fill_pages link, on top of its expiry date — two independent
-- gates (share the link and the code via separate channels).
ALTER TABLE document_fill_pages ADD COLUMN IF NOT EXISTS access_code text;
