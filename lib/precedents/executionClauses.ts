// lib/precedents/executionClauses.ts
// How each kind of party signs.
//
// The blocks previously written into the deeds assumed one company and one
// individual and used "Signed, sealed and delivered by" for both. That is
// wrong for most parties and wrong for an agreement, so a deed generated with
// them needed its signing page rewritten by hand.
//
// Four variants, and the distinctions are legal rather than cosmetic:
//
//   - An INDIVIDUAL signs differently on a deed and on an agreement. "Signed,
//     sealed and delivered ... in the presence of" is the deed form; sealing
//     and delivery are what make it a deed. An agreement is merely "Executed
//     by ... in the presence of".
//
//   - A COMPANY signs the same way either way. What differs is the power
//     relied on: s 127(1) of the Corporations Act 2001 (Cth), signed by two
//     directors, or a director and secretary, or a sole director; or s 126,
//     signed by an authorised representative. A company executing as trustee
//     commonly cites both.
//
// Trustee capacity is not a fifth variant -- it belongs in how the party is
// described ("X Pty Ltd ACN nnn as trustee for the Y Trust"), which is why
// the party description is a field rather than being assembled here.
export type PartyKind =
  | "individual"
  | "company_127_two_officers"
  | "company_127_sole_director"
  | "company_126_authorised";

export type InstrumentKind = "deed" | "agreement";

export interface ExecutionVariant {
  kind: PartyKind;
  label: string;
  /** What a solicitor needs to know to pick correctly. */
  guidance: string;
}

export const EXECUTION_VARIANTS: ExecutionVariant[] = [
  {
    kind: "individual",
    label: "Individual",
    guidance:
      "A natural person. On a deed the words 'signed, sealed and delivered' and an attesting witness are what make it a deed; on an agreement neither is required, though a witness is still usual.",
  },
  {
    kind: "company_127_two_officers",
    label: "Company - two officers (s 127(1))",
    guidance:
      "Two directors, or a director and the company secretary. Signing this way lets the other party rely on the assumptions in s 129(5), so it is the safest form where the company has more than one officer.",
  },
  {
    kind: "company_127_sole_director",
    label: "Company - sole director (s 127(1))",
    guidance:
      "A proprietary company with a single director who is also the sole secretary, or with no secretary. Check the company's current officeholders on ASIC before relying on this.",
  },
  {
    kind: "company_126_authorised",
    label: "Company - authorised representative (s 126)",
    guidance:
      "An agent acting under express or implied authority, rather than an officer. Ask to see the authority, since s 129(5) is not engaged. Common where a corporate trustee signs.",
  },
];

/** Opening words, which are the part that differs between a deed and an agreement. */
function opener(kind: PartyKind, instrument: InstrumentKind): string {
  if (kind === "individual") {
    return instrument === "deed"
      ? "Signed, sealed and delivered by"
      : "Executed by";
  }
  return "Executed by";
}

function statutoryWords(kind: PartyKind): string {
  switch (kind) {
    case "company_127_two_officers":
    case "company_127_sole_director":
      return " in accordance with section 127(1) of the Corporations Act 2001 (Cth) by:";
    case "company_126_authorised":
      return " in accordance with sections 126 and 127 of the Corporations Act 2001 (Cth) by:";
    default:
      return " in the presence of:";
  }
}

/**
 * The signing block for one party, as plain lines. `party` is a placeholder
 * the caller substitutes -- the party's full description including any
 * trustee capacity.
 *
 * Returned as lines rather than rendered, so the deed renderer can style them
 * and a future version can lay the two-officer case out in two columns the way
 * a firm's own template does.
 */
export function executionBlock(
  kind: PartyKind,
  instrument: InstrumentKind,
  party: string
): string[] {
  const head = `${opener(kind, instrument)} ${party}${statutoryWords(kind)}`;

  switch (kind) {
    case "individual":
      return [
        head,
        "",
        "______________________________",
        `Signature of ${party}`,
        "",
        "______________________________",
        "Signature of witness",
        "",
        "______________________________",
        "Full name of witness (print)",
        "",
        "______________________________",
        "Address of witness (print)",
      ];
    case "company_127_two_officers":
      return [
        head,
        "",
        "______________________________",
        "Signature of director",
        "",
        "______________________________",
        "Full name (print)",
        "",
        "______________________________",
        "Signature of director / company secretary",
        "",
        "______________________________",
        "Full name (print)",
      ];
    case "company_127_sole_director":
      return [
        head,
        "",
        "______________________________",
        "Signature of sole director",
        "",
        "______________________________",
        "Full name (print)",
      ];
    case "company_126_authorised":
      return [
        head,
        "",
        "______________________________",
        "Signature of authorised representative",
        "",
        "______________________________",
        "Full name (print)",
      ];
  }
}

/** Shown above the signing page. */
export function executedAsLine(instrument: InstrumentKind): string {
  return instrument === "deed" ? "Executed as a deed." : "Executed as an agreement.";
}
