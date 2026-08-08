-- Adds a country to every company, plus one identifier column per
-- supported non-AU country (mirroring the existing abn/acn columns'
-- shape: a plain nullable text column, no separate custom-fields
-- plumbing -- companies isn't part of the dynamic custom-table system at
-- all, so this stays consistent with how abn/acn already work rather than
-- inventing a second, inconsistent mechanism just for these five).
--
-- country DEFAULT 'AU' NOT NULL -- every company created before this
-- migration is Australian (this product's only market so far, per
-- app/(marketing)/for/law-firm-au/ and every existing template), and
-- Postgres backfills a DEFAULT into existing rows for free on ADD COLUMN
-- (no separate UPDATE needed). New countries added later than this
-- migration's launch list (AU/NZ/US/GB/CA) can just get a NULL identifier
-- column added the same way, without touching this one.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'AU',
  ADD COLUMN IF NOT EXISTS nzbn text,
  ADD COLUMN IF NOT EXISTS ein text,
  ADD COLUMN IF NOT EXISTS company_number text,
  ADD COLUMN IF NOT EXISTS business_number text;

COMMENT ON COLUMN public.companies.country IS 'ISO 3166-1 alpha-2 code (AU/NZ/US/GB/CA at launch) -- set at company creation, see register_company_and_profile and lib/companyIdentifiers.ts.';
COMMENT ON COLUMN public.companies.nzbn IS 'New Zealand Business Number -- only meaningful when country = ''NZ''.';
COMMENT ON COLUMN public.companies.ein IS 'US Employer Identification Number -- only meaningful when country = ''US''.';
COMMENT ON COLUMN public.companies.company_number IS 'UK Companies House company number -- only meaningful when country = ''GB''.';
COMMENT ON COLUMN public.companies.business_number IS 'Canadian Business Number -- only meaningful when country = ''CA''.';
