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
import { deedColumns } from "@/lib/precedents/deedDocx";

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
function opener_(kind: PartyKind, instrument: InstrumentKind): string {
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
  const head = `${opener_(kind, instrument)} ${party}${statutoryWords(kind)}`;

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
      // Side by side: two officers sign next to each other on a firm's own
      // execution page, and stacking them loses which name belongs to which
      // signature. deedColumns marks the split for the renderer.
      return [
        head,
        "",
        deedColumns("______________________________", "______________________________"),
        deedColumns("Signature of director", "Signature of director / company secretary"),
        "",
        deedColumns("______________________________", "______________________________"),
        deedColumns("Full name (print)", "Full name (print)"),
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

/**
 * Recognises which signing block is which in an uploaded execution page.
 *
 * Matching is on the operative words rather than on position, because firms
 * order their execution pages differently and some include only the variants
 * they use. A block we can't place is ignored rather than guessed at -- the
 * built-in scheme covers anything missing, and a misfiled block would put the
 * wrong statutory words under a party's name.
 */
export function classifyExecutionBlock(text: string): PartyKind | null {
  const t = text.toLowerCase();
  if (t.includes("section 126") || t.includes("sections 126")) return "company_126_authorised";
  if (t.includes("127")) {
    // "sole director" appears in the block itself; two-officer blocks name a
    // second signatory instead.
    return t.includes("sole director") ? "company_127_sole_director" : "company_127_two_officers";
  }
  if (t.includes("in the presence of")) return "individual";
  return null;
}

/**
 * Splits an execution page into blocks. A new block starts at each line
 * beginning "Executed by" or "Signed, sealed and delivered by", which is how
 * every variant opens.
 */
export function splitExecutionBlocks(lines: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^\s*(executed by|signed,? sealed and delivered by)\b/i.test(line)) {
      if (current) out.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * The key a recognised block is stored under.
 *
 * An individual has two forms -- the deed one opens "Signed, sealed and
 * delivered", the agreement one "Executed by" -- and both appear on a firm's
 * execution page. Keying only by party kind would let the second overwrite the
 * first, so individuals carry the instrument in their key. A company's block
 * is the same either way and doesn't need it.
 */
export function executionBlockKey(text: string): string | null {
  const kind = classifyExecutionBlock(text);
  if (!kind) return null;
  if (kind !== "individual") return kind;
  return /signed,?\s+sealed\s+and\s+delivered/i.test(text)
    ? "individual_deed"
    : "individual_agreement";
}

/**
 * Replaces the party named in an uploaded block with a placeholder.
 *
 * A firm's execution page is a real signing page from a real matter, so the
 * blocks arrive with actual names in them ("Executed by Anh Thu Doan in the
 * presence of"). Used verbatim they would put a stranger's name on every
 * deed, so the name is found and swapped out. It appears in the opening line
 * between the verb and the operative words, and again under the signature
 * line ("Signature of Anh Thu Doan").
 */
export function parameteriseBlock(lines: string[], placeholder: string): string[] {
  const head = lines[0] ?? "";
  const m = /^\s*(?:executed by|signed,?\s+sealed\s+and\s+delivered\s+by)\s+(.+?)\s+(?:in the presence of|in accordance with)/i.exec(head);
  const name = m?.[1]?.trim();
  if (!name) return lines;
  // Escape for use in a regex; a company name can contain "." and "(".
  const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  return lines.map(l => l.replace(pattern, placeholder));
}


/**
 * The signing block as a three-column table spec: witness on the left, the
 * signatory on the right, a narrow spacer between.
 *
 * Replaces the flat line list for rendering. A signing page is a layout
 * problem, not a prose one -- who signs where, and which name sits under
 * which rule, is the whole point of it.
 */
export function executionSpec(
  kind: PartyKind,
  instrument: InstrumentKind,
  party: string
): { opener: string; party: string; tail: string; left: string[]; right: string[] } {
  const opener = opener_(kind, instrument);
  const tail = statutoryWords(kind);
  switch (kind) {
    case "individual":
      // The witness attests, so their details run down the left; the party
      // signs opposite. Both are needed for a deed and the witness is usual
      // on an agreement too.
      return {
        opener, party, tail,
        left: ["Signature of witness", "Full name of witness (print)", "Address of witness (print)"],
        right: [`Signature of ${party}`],
      };
    case "company_127_two_officers":
      return {
        opener, party, tail,
        left: ["Signature of director"],
        right: ["Signature of director / company secretary"],
      };
    case "company_127_sole_director":
      return { opener, party, tail, left: ["Signature of sole director"], right: [] };
    case "company_126_authorised":
      return { opener, party, tail, left: ["Signature of authorised representative"], right: [] };
  }
}
