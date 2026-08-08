// lib/marketingPages/ids.ts
// The one user and one company this whole feature is scoped to (see
// lib/marketingPages/auth.ts's header comment for why). Split into their
// own zero-dependency file so lib/marketingPages/publishedContent.ts (used
// by the public, unauthenticated marketing routes) doesn't need to import
// lib/marketingPages/auth.ts's session-reading code just for these two ids.
export const MINH_HUYNH_USER_ID = "6a4a8543-0627-4f88-900d-2272b119a865";
export const MINH_HUYNH_COMPANY_ID = "66d7eaff-67a7-4478-bdeb-c18c46f4e844";
