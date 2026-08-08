// Mirrors lib/validation/entityValidation.ts's checksum/format validators
// on the web app (kept as a separate mobile-side copy per this app's own
// mirroring convention -- see mobile/AGENTS.md -- rather than importing
// across the Next.js/Expo package boundary). Despite the filename, this
// now covers every country lib/companyIdentifiers.ts supports, not just
// Australia -- kept in one file rather than splitting it up further.

export function isValidABN(abn: string): boolean {
  const cleaned = abn.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = cleaned.split('').map(Number);
  digits[0] -= 1;
  return digits.reduce((sum, d, i) => sum + d * weights[i], 0) % 89 === 0;
}

export function isValidACN(acn: string): boolean {
  const cleaned = acn.replace(/\s/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;
  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  const total = cleaned.slice(0, 8).split('').reduce((sum, d, i) => sum + Number(d) * weights[i], 0);
  const remainder = total % 10;
  const expected = remainder === 0 ? 0 : 10 - remainder;
  return expected === Number(cleaned[8]);
}

// Format-only checks -- see lib/validation/entityValidation.ts's matching
// functions for why these don't attempt a checksum (NZBN does have a real
// GS1 check digit, but with no verified test vector on hand, a possibly-
// wrong implementation risks rejecting a real, valid number, which is
// worse than under-validating; EIN/UK company number/CA business number
// have no public check digit at all).
export function isValidNZBN(nzbn: string): boolean {
  return /^\d{13}$/.test(nzbn.replace(/\s/g, ''));
}

export function isValidEIN(ein: string): boolean {
  return /^\d{9}$/.test(ein.replace(/[\s-]/g, ''));
}

export function isValidUKCompanyNumber(companyNumber: string): boolean {
  const cleaned = companyNumber.replace(/\s/g, '').toUpperCase();
  return /^\d{8}$/.test(cleaned) || /^[A-Z]{2}\d{6}$/.test(cleaned);
}

export function isValidCABusinessNumber(businessNumber: string): boolean {
  return /^\d{9}$/.test(businessNumber.replace(/\s/g, ''));
}
