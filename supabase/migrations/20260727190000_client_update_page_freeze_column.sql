-- Staff-controlled, page-wide (applies to both staff and the client, same
-- as date_format) option to freeze the first column in spreadsheet mode.
-- Off by default -- the earlier always-on frozen column was removed
-- because it caused an overlap bug on scroll (see MatterBoard.tsx's header
-- comment); this reintroduces it as an explicit opt-in, applied via
-- CSS sticky with an opaque background on just the first cell in each row,
-- not the split-panel design that caused the original bug.
ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS freeze_first_column boolean NOT NULL DEFAULT false;
