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