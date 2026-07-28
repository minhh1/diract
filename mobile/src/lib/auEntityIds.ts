// Copied from the ABN/ACN checksum validators in app/login/page.tsx on the
// web app, so mobile registration enforces the same rules.

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
