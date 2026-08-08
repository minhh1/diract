// Single source of truth for "which countries can a new company be
// registered in, and what business identifier(s) does each one ask for" --
// shared by every place a company gets created (components/
// CreateCompanyModal.tsx, app/(marketing)/login/page.tsx, app/(marketing)/
// for/law-firm-au/get-started/page.tsx). mobile/src/app/sign-in.tsx keeps
// its own mirrored copy (this app's established convention for the mobile
// client -- see mobile/AGENTS.md -- rather than a cross-package import from
// a completely separate Expo build).
//
// AU/NZ/US/GB/CA at launch -- ABN/ACN already existed as dedicated
// companies columns; nzbn/ein/company_number/business_number were added
// alongside country in supabase/migrations/20260808040000_companies_country_identifiers.sql,
// same plain-column shape (companies isn't part of the dynamic
// custom-table system, so this doesn't invent a second mechanism just for
// these five). register_company_and_profile
// (20260808050000_register_company_country_identifiers.sql) accepts all of
// them as optional params.
import {
  isValidABN, isValidACN, isValidNZBN, isValidEIN, isValidUKCompanyNumber, isValidCABusinessNumber,
} from "@/lib/validation/entityValidation";

export type CountryCode = "AU" | "NZ" | "US" | "GB" | "CA";

export const COUNTRIES: { code: CountryCode; label: string }[] = [
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
];

export type IdentifierKey = "abn" | "acn" | "nzbn" | "ein" | "company_number" | "business_number";

export interface IdentifierField {
  key: IdentifierKey;
  label: string;
  placeholder: string;
  validate: (value: string) => boolean;
  invalidMessage: string;
}

// Every identifier is optional at company-creation time, same as ABN/ACN
// already were -- a real value just has to actually be well-formed if
// given at all (validate() below is only ever called on a non-empty,
// trimmed value -- see validateIdentifiers).
export const COUNTRY_IDENTIFIERS: Record<CountryCode, IdentifierField[]> = {
  AU: [
    { key: "abn", label: "ABN", placeholder: "Optional", validate: isValidABN, invalidMessage: "ABN is not valid." },
    { key: "acn", label: "ACN", placeholder: "Optional", validate: isValidACN, invalidMessage: "ACN is not valid." },
  ],
  NZ: [
    { key: "nzbn", label: "NZBN", placeholder: "Optional -- 13 digits", validate: isValidNZBN, invalidMessage: "NZBN must be 13 digits." },
  ],
  US: [
    { key: "ein", label: "EIN", placeholder: "Optional -- e.g. 12-3456789", validate: isValidEIN, invalidMessage: "EIN must be 9 digits." },
  ],
  GB: [
    { key: "company_number", label: "Company Number", placeholder: "Optional -- e.g. 12345678", validate: isValidUKCompanyNumber, invalidMessage: "Company number must be 8 digits, or 2 letters followed by 6 digits." },
  ],
  CA: [
    { key: "business_number", label: "Business Number", placeholder: "Optional -- 9 digits", validate: isValidCABusinessNumber, invalidMessage: "Business Number must be 9 digits." },
  ],
};

export type IdentifierValues = Partial<Record<IdentifierKey, string>>;

// Returns the first validation error across this country's identifier
// fields, or null if every non-empty one is well-formed -- matches the
// single-message error convention every one of these forms already used
// for ABN/ACN alone.
export function validateIdentifiers(country: CountryCode, values: IdentifierValues): string | null {
  for (const field of COUNTRY_IDENTIFIERS[country]) {
    const v = (values[field.key] || "").trim();
    if (v && !field.validate(v)) return field.invalidMessage;
  }
  return null;
}

// Maps country + identifier values onto register_company_and_profile's own
// p_* param names -- every field not relevant to the chosen country is
// simply omitted (null), same as ABN/ACN already were for anyone who left
// them blank.
export function identifiersToRpcParams(country: CountryCode, values: IdentifierValues) {
  return {
    p_country: country,
    p_abn: values.abn?.trim() || null,
    p_acn: values.acn?.trim() || null,
    p_nzbn: values.nzbn?.trim() || null,
    p_ein: values.ein?.trim() || null,
    p_company_number: values.company_number?.trim() || null,
    p_business_number: values.business_number?.trim() || null,
  };
}
