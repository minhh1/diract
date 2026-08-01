// lib/precedents/library/index.ts
// The seeded Australian law-firm precedent library.
//
// Installed per company by scripts/seedPrecedentLibrary.ts, keyed on
// PrecedentSeed.key so re-running as the library grows inserts what's new
// and leaves a firm's own edits alone.
//
// Phase A (shipped): jurisdiction-neutral core -- Client Care, Debt Recovery
// and general Litigation correspondence. These apply in every state and are
// what every matter needs regardless of practice area.
//
// Phase B/C (to follow): NSW depth across Conveyancing, Family Law, Personal
// Injury, Wills & Estates, Criminal and Immigration, then the VIC/QLD/SA/WA/
// TAS variants for the documents where state law genuinely diverges. Add a
// module here and it flows through the seed script automatically.
import { assertSeedsValid, type PrecedentSeed } from "./types";
import { CLIENT_CARE_PRECEDENTS } from "./clientCare";
import { DEBT_RECOVERY_PRECEDENTS } from "./debtRecovery";
import { LITIGATION_PRECEDENTS } from "./litigation";

export const PRECEDENT_LIBRARY: PrecedentSeed[] = [
  ...CLIENT_CARE_PRECEDENTS,
  ...DEBT_RECOVERY_PRECEDENTS,
  ...LITIGATION_PRECEDENTS,
];

// Fails loudly at import time rather than silently seeding a duplicate key
// or an unflagged court document -- both are mistakes that are cheap to make
// when hand-authoring hundreds of these and expensive to find later.
assertSeedsValid(PRECEDENT_LIBRARY);

export { type PrecedentSeed } from "./types";
