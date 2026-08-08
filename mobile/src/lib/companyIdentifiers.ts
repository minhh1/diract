// Mirrors lib/companyIdentifiers.ts on the web app (this app's own
// mirroring convention -- see mobile/AGENTS.md -- rather than importing
// across the Next.js/Expo package boundary). Single source of truth for
// "which countries can a new company be registered in from this app, and
// what business identifier(s) does each one ask for" -- used by
// app/sign-in.tsx's registration form.
import {
  isValidABN, isValidACN, isValidNZBN, isValidEIN, isValidUKCompanyNumber, isValidCABusinessNumber,
} from './auEntityIds';

export type CountryCode = 'AU' | 'NZ' | 'US' | 'GB' | 'CA';

export const COUNTRIES: { code: CountryCode; label: string }[] = [
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
];

export type IdentifierKey = 'abn' | 'acn' | 'nzbn' | 'ein' | 'company_number' | 'business_number';

export interface IdentifierField {
  key: IdentifierKey;
  label: string;
  placeholder: string;
  validate: (value: string) => boolean;
  invalidMessage: string;
}

// Every identifier is optional at company-creation time, same as ABN/ACN
// already were -- validate() is only ever called on a non-empty, trimmed
// value (see validateIdentifiers).
export const COUNTRY_IDENTIFIERS: Record<CountryCode, IdentifierField[]> = {
  AU: [
    { key: 'abn', label: 'ABN', placeholder: 'ABN (optional)', validate: isValidABN, invalidMessage: 'ABN is not valid.' },
    { key: 'acn', label: 'ACN', placeholder: 'ACN (optional)', validate: isValidACN, invalidMessage: 'ACN is not valid.' },
  ],
  NZ: [
    { key: 'nzbn', label: 'NZBN', placeholder: 'NZBN (optional)', validate: isValidNZBN, invalidMessage: 'NZBN must be 13 digits.' },
  ],
  US: [
    { key: 'ein', label: 'EIN', placeholder: 'EIN (optional)', validate: isValidEIN, invalidMessage: 'EIN must be 9 digits.' },
  ],
  GB: [
    { key: 'company_number', label: 'Company Number', placeholder: 'Company Number (optional)', validate: isValidUKCompanyNumber, invalidMessage: 'Company number must be 8 digits, or 2 letters followed by 6 digits.' },
  ],
  CA: [
    { key: 'business_number', label: 'Business Number', placeholder: 'Business Number (optional)', validate: isValidCABusinessNumber, invalidMessage: 'Business Number must be 9 digits.' },
  ],
};

export type IdentifierValues = Partial<Record<IdentifierKey, string>>;

export function validateIdentifiers(country: CountryCode, values: IdentifierValues): string | null {
  for (const field of COUNTRY_IDENTIFIERS[country]) {
    const v = (values[field.key] || '').trim();
    if (v && !field.validate(v)) return field.invalidMessage;
  }
  return null;
}

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
