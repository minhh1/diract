// lib/precedents/addressBlock.ts
// Normalises whatever recipient name/address text reached the issuing
// pipeline into the conventional Australian mailing block a letter's address
// field is supposed to render as:
//
//   Recipient Name
//   Suite Level, Street Name
//   Suburb STATE POSTCODE
//
// The web Issue modal already asks for that shape line by line, but the bot
// collects it as free text over chat -- observed live (2026-08-02) that
// "ASP Agent Pty Ltd, Level 2, 231 Moore Street, Liverpool NSW 2176" typed
// as one answer came out as a single run-on line, with the whole string
// repeated as both the recipient name AND the address. So this splits a
// comma-run-on into its real lines, pulls the name off the front when the
// name field swallowed the address too, and drops an address's leading
// repeat of the name -- leaving an already-multi-line address alone beyond
// tidying whitespace and the state's casing.
const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
// "Liverpool NSW 2176" -- suburb, state, 4-digit postcode. Anchored at the
// end so it only matches the tail of an address, never a street name that
// happens to contain a state word (e.g. "Victoria Road").
const SUBURB_LINE_RE = new RegExp(`\\b(${STATES.join("|")})\\b\\.?\\s+\\d{4}\\s*$`, "i");
// The state/postcode split across two comma parts ("... , Liverpool, NSW 2176").
const STATE_POSTCODE_ONLY_RE = new RegExp(`^\\s*(${STATES.join("|")})\\b\\.?\\s+\\d{4}\\s*$`, "i");

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[,;]+$/, "").trim();
}

// A state abbreviation is conventionally capitalised in a mailing address
// even when it was typed in lower case ("liverpool nsw 2176").
function upperCaseState(line: string): string {
  return line.replace(new RegExp(`\\b(${STATES.join("|")})\\b`, "gi"), (m) => m.toUpperCase());
}

function splitParts(text: string): string[] {
  return text.split(",").map(tidy).filter(Boolean);
}

// Rebuilds a comma-run-on into address lines: everything from the first part
// that carries the suburb/state/postcode onward becomes the final line, and
// whatever came before it is the street line. A run-on with no recognisable
// suburb line is left as its own single line rather than guessed at.
function linesFromParts(parts: string[]): string[] {
  if (!parts.length) return [];
  // "... , Richmond, VIC 3121" -- the suburb was comma-split off its own
  // state/postcode, so the two go back together as one line. Checked before
  // the combined pattern below, which would otherwise treat the bare
  // "VIC 3121" as the whole final line and leave the suburb up on the street.
  const stateOnlyAt = parts.findIndex((p) => STATE_POSTCODE_ONLY_RE.test(p));
  let suburbAt: number;
  if (stateOnlyAt > 0) {
    parts = [...parts.slice(0, stateOnlyAt - 1), `${parts[stateOnlyAt - 1]} ${parts[stateOnlyAt]}`, ...parts.slice(stateOnlyAt + 1)];
    suburbAt = stateOnlyAt - 1;
  } else if (stateOnlyAt === 0) {
    suburbAt = 0;
  } else {
    suburbAt = parts.findIndex((p) => SUBURB_LINE_RE.test(p));
  }
  if (suburbAt === -1) return [parts.join(", ")];

  const street = parts.slice(0, suburbAt).join(", ");
  const tail = parts.slice(suburbAt).join(", ");
  return [street, tail].filter(Boolean);
}

function toLines(text: string): string[] {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  // Already laid out line by line (the web Issue modal's textarea) -- only
  // the line's own commas are the author's, so nothing is re-flowed.
  if (trimmed.includes("\n")) return trimmed.split(/\r?\n/).map(tidy).filter(Boolean);
  return linesFromParts(splitParts(trimmed));
}

function sameLine(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return !!a && norm(a) === norm(b);
}

export interface RecipientBlock {
  /** The addressee alone -- what a letterhead's {{recipient_name}} tag gets. */
  name: string;
  /** The remaining address lines, "\n"-joined (Docxtemplater renders each as its own line -- `linebreaks: true`). */
  address: string;
}

export function formatRecipientBlock(recipientName: string, recipientAddress: string): RecipientBlock {
  const nameParts = splitParts(recipientName || "");
  let addressLines = toLines(recipientAddress);

  // The name field swallowed the address too ("ASP Agent Pty Ltd, Level 2,
  // 231 Moore Street, Liverpool NSW 2176") -- keep the first part as the
  // name and treat the rest as address lines, but only adopt them when the
  // address field didn't already have real content of its own.
  const name = nameParts[0] || "";
  if (nameParts.length > 1 && !addressLines.length) addressLines = linesFromParts(nameParts.slice(1));

  // The address repeating the name on its first line (either because the bot
  // asked for both and got the same answer twice, or because a firm types
  // the addressee at the top of the address block) would print it twice.
  if (name && addressLines.length && sameLine(addressLines[0], name)) addressLines = addressLines.slice(1);

  return { name, address: addressLines.map(upperCaseState).join("\n") };
}

// The full block as one string -- used for the plain-letterhead case, where
// there's no separate {{recipient_name}} tag and the whole thing has to go
// into the address tag on its own lines.
export function formatAddressBlock(recipientName: string, recipientAddress: string): string {
  const { name, address } = formatRecipientBlock(recipientName, recipientAddress);
  return [name, address].filter(Boolean).join("\n");
}
