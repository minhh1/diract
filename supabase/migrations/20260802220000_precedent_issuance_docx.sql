-- Every issued document is now stored as BOTH the PDF (storage_path, as
-- before) and the .docx it was rendered from -- a letter almost always needs
-- one last edit before it goes out, and a flat PDF meant re-typing it.
-- Nullable: rows issued before this column existed are PDF-only, as is any
-- issuance whose .docx upload failed (see lib/precedents/issuePrecedent.ts,
-- which treats that as best-effort rather than failing the issuance).

ALTER TABLE precedent_issuances ADD COLUMN IF NOT EXISTS docx_storage_path text;
