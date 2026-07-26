-- What kind of business a company is (e.g. 'Law Firm') -- currently just
-- used to gate the "Add detailed (law firm) template" invoice template
-- button (that template's fixed layout -- remittance advice, Notice of
-- Rights costs-assessment boilerplate -- only makes sense for a legal
-- practice), but a plain text column rather than an enum since other
-- company-type-specific behaviour will likely want to key off it later.
-- Unset (NULL) for every existing company except where explicitly set
-- below -- no default because most of this app's features are industry-
-- agnostic and shouldn't silently start behaving differently on upgrade.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_type text;

UPDATE companies SET company_type = 'Law Firm' WHERE name = 'Huynh Lawyers';
