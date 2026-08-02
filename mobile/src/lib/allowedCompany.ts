// mobile/src/lib/allowedCompany.ts
// Mirrors lib/vmProviders/allowedCompany.ts on the web app -- kept as a
// separate copy rather than a shared import since this is a wholly separate
// Expo package with its own module resolution, not part of the Next.js
// app's build. The virtual computers feature is being wound down company-
// wide; only this company still has anything to open here going forward.
// If that id ever changes, update both copies.
export const VIRTUAL_COMPUTERS_ALLOWED_COMPANY_ID = 'a49b484d-100d-4c3e-b3b6-69c1a18cc783'; // Huynh Lawyers
