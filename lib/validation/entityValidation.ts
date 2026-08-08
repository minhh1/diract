/**
 * Validates an Australian Business Number using the official modulus-89
 * check-digit algorithm. Returns true only for an ABN that is genuinely
 * well-formed, not just 11 digits.
 */
export function isValidABN(abn: string): boolean {
  const cleaned = abn.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) return false;

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = cleaned.split('').map(Number);
  digits[0] -= 1; // first digit is reduced by 1 before weighting, per the ATO algorithm

  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  return sum % 89 === 0;
}

/**
 * Validates an Australian Company Number using its check-digit algorithm
 * (a weighted modulus-10 calculation over the first 8 digits, compared
 * against the 9th).
 */
export function isValidACN(acn: string): boolean {
  const cleaned = acn.replace(/\s/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;

  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  const digits = cleaned.slice(0, 8).split('').map(Number);
  const checkDigit = Number(cleaned[8]);

  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  const remainder = sum % 10;
  const expectedCheck = remainder === 0 ? 0 : 10 - remainder;

  return expectedCheck === checkDigit;
}

/**
 * Validates the FORMAT of an Australian BSB (6 digits, optionally written
 * as XXX-XXX). Unlike ABN/ACN, a BSB has no public check-digit algorithm
 * -- it's just an assigned identifier, not a self-validating number -- so
 * this catches the typos a format check actually can (too few/many
 * digits, letters, stray characters), not a wrong-but-plausible BSB. A
 * true correctness check would need matching against the real APCA BSB
 * directory, which isn't bundled here.
 */
export function isValidBSB(bsb: string): boolean {
  const cleaned = bsb.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(cleaned);
}

/**
 * Validates the FORMAT of an Australian bank account number -- digits
 * only, 4 to 10 of them (the real range across Australian institutions).
 * Like isValidBSB, this is a format check, not a checksum -- account
 * numbers don't carry a public check digit the way ABN/ACN do.
 */
export function isValidAccountNumber(accountNumber: string): boolean {
  const cleaned = accountNumber.replace(/\s/g, '');
  return /^\d{4,10}$/.test(cleaned);
}

/**
 * Validates the FORMAT of a New Zealand Business Number (13 digits). NZBN
 * is officially a GS1 GLN and does carry a real check-digit algorithm, but
 * unlike ABN/ACN (verified against the ATO's own published algorithm and
 * worked examples) this repo has no verified test vector for it -- shipping
 * a possibly-wrong checksum risks silently REJECTING a real, valid NZBN,
 * which is worse than under-validating. Same reasoning as isValidBSB below.
 */
export function isValidNZBN(nzbn: string): boolean {
  const cleaned = nzbn.replace(/\s/g, '');
  return /^\d{13}$/.test(cleaned);
}

/**
 * Validates the FORMAT of a US Employer Identification Number -- 9 digits,
 * optionally written as XX-XXXXXXX. The IRS assigns EINs from a list of
 * valid campus-code prefixes that changes over time and isn't publicly
 * bundled here, so (like isValidBSB) this only catches malformed input, not
 * a wrong-but-plausible EIN.
 */
export function isValidEIN(ein: string): boolean {
  const cleaned = ein.replace(/[\s-]/g, '');
  return /^\d{9}$/.test(cleaned);
}

/**
 * Validates the FORMAT of a UK Companies House company number -- 8 digits
 * for a standard England/Wales company, or 2 letters (SC = Scotland,
 * NI = Northern Ireland, OC/SO/NC = LLPs, FC = overseas) followed by 6
 * digits for the other registration types. No public check digit exists.
 */
export function isValidUKCompanyNumber(companyNumber: string): boolean {
  const cleaned = companyNumber.replace(/\s/g, '').toUpperCase();
  return /^\d{8}$/.test(cleaned) || /^[A-Z]{2}\d{6}$/.test(cleaned);
}

/**
 * Validates the FORMAT of a Canadian Business Number -- the base 9-digit
 * identifier (before any program-account suffix like RT0001). No public
 * check digit.
 */
export function isValidCABusinessNumber(businessNumber: string): boolean {
  const cleaned = businessNumber.replace(/\s/g, '');
  return /^\d{9}$/.test(cleaned);
}

export interface FieldValidationRule {
  validate: (value: string) => string | null; // returns an error message, or null if valid
}

export const ENTITY_FIELD_VALIDATORS: Record<string, FieldValidationRule> = {
  name: {
    validate: (v) => (!v || !v.trim()) ? "Entity name can't be empty" : null,
  },
  entity_type: {
    validate: (v) => (!v || !v.trim()) ? "Entity type can't be empty" : null,
  },
  abn: {
    validate: (v) => {
      if (!v || !v.trim()) return null; // optional -- empty is fine
      return isValidABN(v) ? null : "Not a valid ABN (must be 11 digits and pass the ABN checksum)";
    },
  },
  acn: {
    validate: (v) => {
      if (!v || !v.trim()) return null; // optional
      return isValidACN(v) ? null : "Not a valid ACN (must be 9 digits and pass the ACN checksum)";
    },
  },
  bsb: {
    validate: (v) => {
      if (!v || !v.trim()) return null; // optional
      return isValidBSB(v) ? null : "Not a valid BSB (must be 6 digits)";
    },
  },
  account_number: {
    validate: (v) => {
      if (!v || !v.trim()) return null; // optional
      return isValidAccountNumber(v) ? null : "Not a valid account number (must be 4-10 digits)";
    },
  },
};