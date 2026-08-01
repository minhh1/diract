// lib/precedents/library/index.ts
// The seeded Australian law-firm precedent library.
//
// Installed per company by scripts/seedPrecedentLibrary.ts, keyed on
// PrecedentSeed.key so re-running as the library grows inserts what's new
// and leaves a firm's own edits alone.
//
// Phase A: jurisdiction-neutral core -- Client Care, Debt Recovery and
// general Litigation correspondence. Applies in every state.
//
// Phase B: NSW depth (Conveyancing, Personal Injury, Wills & Estates, Small
// Claims, Criminal) plus the two federal areas that need no state variants
// at all -- Family Law (Family Law Act 1975 (Cth), FCFCOA) and Immigration
// (Migration Act 1958 (Cth), ART).
//
// Phase C (to follow): VIC/QLD/SA/WA/TAS variants of the state-specific
// documents only -- conveyancing disclosure and duty, personal-injury
// pre-litigation regimes, probate, minor-civil forums, and Magistrates
// court criminal. Add a module here and it flows through the install route
// automatically; existing installs top up on their next run.
import { assertSeedsValid, type PrecedentSeed } from "./types";
import { CLIENT_CARE_PRECEDENTS } from "./clientCare";
import { DEBT_RECOVERY_PRECEDENTS } from "./debtRecovery";
import { LITIGATION_PRECEDENTS } from "./litigation";
import { CONVEYANCING_NSW_PRECEDENTS } from "./conveyancingNsw";
import { FAMILY_LAW_PRECEDENTS } from "./familyLaw";
import { WILLS_ESTATES_NSW_PRECEDENTS } from "./willsEstatesNsw";
import { PERSONAL_INJURY_NSW_PRECEDENTS } from "./personalInjuryNsw";
import { SMALL_CLAIMS_NSW_PRECEDENTS, CRIMINAL_NSW_PRECEDENTS } from "./smallClaimsCriminalNsw";
import { IMMIGRATION_PRECEDENTS } from "./immigration";

export const PRECEDENT_LIBRARY: PrecedentSeed[] = [
  ...CLIENT_CARE_PRECEDENTS,
  ...DEBT_RECOVERY_PRECEDENTS,
  ...LITIGATION_PRECEDENTS,
  ...CONVEYANCING_NSW_PRECEDENTS,
  ...FAMILY_LAW_PRECEDENTS,
  ...WILLS_ESTATES_NSW_PRECEDENTS,
  ...PERSONAL_INJURY_NSW_PRECEDENTS,
  ...SMALL_CLAIMS_NSW_PRECEDENTS,
  ...CRIMINAL_NSW_PRECEDENTS,
  ...IMMIGRATION_PRECEDENTS,
];

// Fails loudly at import time rather than silently seeding a duplicate key
// or an unflagged court document -- both are mistakes that are cheap to make
// when hand-authoring hundreds of these and expensive to find later.
assertSeedsValid(PRECEDENT_LIBRARY);

export { type PrecedentSeed } from "./types";
