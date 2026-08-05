# Niksen Time entity import -- batches 1-5

Transcribed from the 5 screenshots (~115 rows once blanks are dropped). Files: `niksen-entities-batch1.csv` through `batch5.csv`. Every row has a `flags` column -- read it before importing, especially anywhere it says "re-check against source".

BSB and account number were dropped from these files per request (name, entity type, established date, directors, ACN, ABN, TFN, GST frequency, bank account name, and Xero set-up status are still here).

## ACN/ABN validation (new)

Every ACN/ABN was run through the official check-digit algorithm (a hard mathematical property every real ACN/ABN satisfies -- not a guess, a certainty). Result across all 5 batches:

- **ACN: 70 valid, 45 invalid**
- **ABN: 42 valid, 19 invalid**

A checksum failure means either I mis-transcribed a digit, or the number was already wrong in the source. Either way, it needs a human to check it against the real record before import -- a failing checksum can't be "fixed" by guessing.

This validation is now a permanent part of the app, not just a one-off check on this batch:
- `lib/validation/entityValidation.ts` already had `isValidABN`/`isValidACN` (used by the entity edit modal) -- now also wired into **`components/NewEntityModal.tsx`** (inline red-border validation when creating a new entity) and **the CSV Import review table** (`components/ImportModal.tsx`/`ImportReviewTable.tsx` -- any future CSV import of entities will show an amber warning on any row with a checksum-invalid ACN/ABN, before you commit).
- I also confirmed the `entities` table already has DB-level `chk_valid_abn`/`chk_valid_acn` constraints -- an invalid ABN/ACN physically cannot be saved to the database at all, even bypassing the UI. That's the strongest layer.
- **True registry validation** (confirming an ABN is actually registered/active, matching the ATO's live public register -- not just structurally well-formed) would need the Australian Business Register's free ABN Lookup web service, which requires signing up for your own GUID at abr.business.gov.au -- I can wire that in if you want it, but I can't obtain the credential on your behalf.

## Before importing

1. **~25 rows are very likely near-duplicates of entities already in Niksen Time** (case-only differences, "ATF ... Trust" suffix differences, or a Corporate Trustee row for a Trust already on file under a different name). Flagged per-row. Run through Settings → Import so its fuzzy duplicate-detection and New/Skip/Update review step catches them -- don't bulk-insert directly.
2. **Two rows in batch 5 have an identical TFN** (5 Newline Pty Ltd and 63 Meymot Pty Ltd both read "218 157 627") -- almost certainly a transcription error, not a real shared TFN.
3. **"Xero set-up" isn't a clean yes/no in a few rows**: "not yet" (several) and "cancelled" (76 Westminster Pty Ltd) -- decide how these should map before import.
4. **"28 McClelland Pty Ltd" vs the existing "28 Mccleland Pty Ltd"** -- likely the same entity, spelling difference either in the old record or this one. Needs a manual call.
5. One row's ABN literally read "not required" (Niksen Modpacs Ventures) -- transcribed as-is.

## What's NOT in these CSVs

- **Directors** (`director_names`, semicolon-separated) -- my reference only. The generic Import tool can't link relation fields, so directors need `entity_officeholders` with `officeholder_entity_id` (see `supabase/migrations/20260729020000_niksen_entity_admin_fields.sql`) via a separate script once entities are confirmed and imported. `components/dashboard/FieldLayoutEditor.tsx`'s Officeholders editor now has a proper entity-picker for this going forward.
- **Trust links** -- none of these rows had a distinct "Trust" value. The Corporate Trustee ↔ Trust relationship (`entity_relationships`, relationship_type='Trustee') needs matching each Corporate Trustee to its Trust by name, which needs a human eye given how inconsistent the naming is.
- The `flags` column is my own review notes -- strip it before running through Settings → Import.

## Suggested next step

Review the `flags` columns -- pay closest attention to every "INVALID" checksum result and every "likely duplicate" note -- correct anything wrong, then run through Settings → Import → Entities. No database writes have been made for any of this; everything is staged in these CSVs only.
