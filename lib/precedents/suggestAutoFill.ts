// lib/precedents/suggestAutoFill.ts
// Suggests which of the company's own matter fields a precedent's fill-in
// field should pre-populate from.
//
// The library ships ~1,230 fill-in fields written as plain labels ("Our
// client", "Matter number", "Settlement date"). Each firm's custom fields are
// named however that firm named them, and some carry generated keys
// (field_1783322037432 = "Client Name"), so the library can't hardcode
// bindings -- they have to be matched per company, against labels.
//
// Suggestions only. Nothing here writes a binding; the UI proposes and a
// human confirms, because a wrong binding silently puts the wrong text in a
// letter, which is worse than an empty blank the author notices.

/** A company custom field available to bind to. */
export interface BindableField {
  id: string;
  label: string;
}

export interface AutoFillSuggestion {
  /** Confidence 0-1. */
  score: number;
  field: BindableField;
}

/** Lowercase, drop punctuation, collapse whitespace. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Phrasings a solicitor writes in a precedent vs what the field tends to be
// called in the matter table. Left side is what appears in a body template,
// right side the words to also try when matching. Kept deliberately small --
// these are the recurring ones from the shipped library, not a thesaurus.
const SYNONYMS: Record<string, string[]> = {
  "our client": ["client name", "client"],
  "your client": ["other side name", "other side"],
  "the client": ["client name", "client"],
  "client": ["client name"],
  "other side": ["other side name"],
  "other party": ["other side name"],
  "opposing solicitor": ["other side solicitor"],
  "other side s solicitor": ["other side solicitor"],
  "matter no": ["matter number"],
  "file number": ["matter number"],
  "our ref": ["matter number"],
  "agent": ["selling agent"],
  "solicitor with carriage": ["person responsible"],
  "responsible solicitor": ["person responsible"],
  "fee earner": ["person responsible"],
  "assisting": ["person assisting"],
  "debtor s name": ["debtor"],
};

const STOPWORDS = new Set(["the", "a", "an", "of", "for", "s", "to", "in", "our", "your"]);

// Words that carry no identity on their own. "Completion due date" and "Due
// Diligence Date" share two of these and nothing else -- without this guard
// they score as a match and silently put the wrong date in a letter.
const GENERIC = new Set(["date", "name", "amount", "number", "address", "due", "details", "paid", "total", "type"]);

function tokens(s: string): string[] {
  return normalise(s).split(" ").filter(t => t && !STOPWORDS.has(t));
}

/**
 * Score how well a precedent field label matches a company field label.
 * 1 = same words. Below ~0.55 is too speculative to show.
 */
function score(precedentLabel: string, fieldLabel: string): number {
  const a = normalise(precedentLabel);
  const b = normalise(fieldLabel);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const at = tokens(a);
  const bt = tokens(b);
  if (!at.length || !bt.length) return 0;
  if (at.join(" ") === bt.join(" ")) return 0.97;

  // One label wholly contains the other ("Contract date" vs "Date"): related,
  // but the shorter one is vaguer, so discount by how much is unaccounted for.
  const shared = at.filter(t => bt.includes(t));
  if (!shared.length) return 0;
  const coverage = shared.length / Math.max(at.length, bt.length);

  // Two labels that share only generic words aren't related: "Contract date"
  // and "Settlement date" both mean a date and nothing more in common.
  if (shared.every(t => GENERIC.has(t))) return coverage * 0.4;
  return coverage;
}

/**
 * Best binding for one fill-in field, or null when nothing is close enough.
 * `threshold` is intentionally high: an unbound field shows as a blank the
 * author fills in, which is safe, whereas a wrong binding is not.
 */
export function suggestAutoFill(
  precedentLabel: string,
  fields: BindableField[],
  threshold = 0.55
): AutoFillSuggestion | null {
  let best: AutoFillSuggestion | null = null;

  // Parentheticals disambiguate for whoever is filling the form in ("Our
  // client (creditor)", "Amount (repeat)") -- they aren't part of what the
  // field holds, so match on the label without them too.
  const bare = precedentLabel.replace(/\([^)]*\)/g, " ").trim();
  const candidates = [
    precedentLabel,
    ...(bare && bare !== precedentLabel ? [bare] : []),
    ...(SYNONYMS[normalise(precedentLabel)] || []),
    ...(SYNONYMS[normalise(bare)] || []),
  ];

  for (const field of fields) {
    let s = 0;
    for (const candidate of candidates) s = Math.max(s, score(candidate, field.label));
    if (s > (best?.score ?? 0)) best = { score: s, field };
  }

  return best && best.score >= threshold ? best : null;
}
