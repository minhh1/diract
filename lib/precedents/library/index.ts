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
// Phase C: VIC/QLD/SA/WA/TAS variants, limited to the documents where state
// law genuinely diverges -- conveyancing vendor disclosure and cooling off
// (WA and TAS have no cooling-off period at all), personal-injury
// pre-litigation regimes (QLD's PIPA compulsory conference, VIC's serious
// injury gateway), and minor-civil forums (Tasmania has no general civil
// tribunal). Everything else stays a single jurisdiction-neutral precedent.
//
// Add a module here and it flows through the install route automatically;
// existing installs top up on their next run without touching a firm's own
// edits.
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
import { CONVEYANCING_STATES_PRECEDENTS } from "./conveyancingStates";
import { STATE_PI_CIVIL_PRECEDENTS } from "./statesPiCivil";
import { COMMERCIAL_PRECEDENTS } from "./commercial";
import { LITIGATION_COURT_PRECEDENTS } from "./litigationCourt";
import { COURT_NSW_UCPR_PRECEDENTS } from "./courtNswUcpr";
import { COURT_FCFCOA_PRECEDENTS } from "./courtFcfcoa";
import { COURT_SUBMISSIONS_PRECEDENTS } from "./courtSubmissions";
import { EMPLOYMENT_PRECEDENTS } from "./employment";
import { PROBATE_STATES_PRECEDENTS } from "./probateStates";
import { CRIMINAL_STATES_PRECEDENTS } from "./criminalStates";
import { FAMILY_LAW_COURT_PRECEDENTS } from "./familyLawCourt";
import { CONVEYANCING_EXTRA_PRECEDENTS } from "./conveyancingExtra";
import { CONVEYANCING_STATES_DEPTH_PRECEDENTS } from "./conveyancingStatesDepth";
import { STATES_REMAINING_PRECEDENTS } from "./statesRemaining";
import { FAMILY_LAW_PROCEDURE_PRECEDENTS } from "./familyLawProcedure";
import { COMMERCIAL_AGREEMENT_PRECEDENTS } from "./commercialAgreements";
import { INSOLVENCY_PRECEDENTS } from "./insolvency";
import { FAMILY_LAW_STAGES_PRECEDENTS } from "./familyLawStages";
import { FAMILY_LAW_SPECIALIST_LIST_PRECEDENTS } from "./familyLawSpecialistLists";
import { WILLS_ESTATES_DEPTH_PRECEDENTS } from "./willsEstatesDepth";
import { WILLS_INSTRUMENTS_PRECEDENTS } from "./willsInstruments";

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
  ...CONVEYANCING_STATES_PRECEDENTS,
  ...STATE_PI_CIVIL_PRECEDENTS,
  ...COMMERCIAL_PRECEDENTS,
  ...LITIGATION_COURT_PRECEDENTS,
  ...COURT_NSW_UCPR_PRECEDENTS,
  ...COURT_FCFCOA_PRECEDENTS,
  ...COURT_SUBMISSIONS_PRECEDENTS,
  ...EMPLOYMENT_PRECEDENTS,
  ...PROBATE_STATES_PRECEDENTS,
  ...CRIMINAL_STATES_PRECEDENTS,
  ...FAMILY_LAW_COURT_PRECEDENTS,
  ...CONVEYANCING_EXTRA_PRECEDENTS,
  ...CONVEYANCING_STATES_DEPTH_PRECEDENTS,
  ...STATES_REMAINING_PRECEDENTS,
  ...FAMILY_LAW_PROCEDURE_PRECEDENTS,
  ...COMMERCIAL_AGREEMENT_PRECEDENTS,
  ...INSOLVENCY_PRECEDENTS,
  ...FAMILY_LAW_STAGES_PRECEDENTS,
  ...FAMILY_LAW_SPECIALIST_LIST_PRECEDENTS,
  ...WILLS_ESTATES_DEPTH_PRECEDENTS,
  ...WILLS_INSTRUMENTS_PRECEDENTS,
];

// Fails loudly at import time rather than silently seeding a duplicate key
// or an unflagged court document -- both are mistakes that are cheap to make
// when hand-authoring hundreds of these and expensive to find later.
assertSeedsValid(PRECEDENT_LIBRARY);

export { type PrecedentSeed } from "./types";
