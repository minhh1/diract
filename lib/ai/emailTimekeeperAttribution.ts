// lib/ai/emailTimekeeperAttribution.ts
// Collapses duplicate project_emails rows and works out which staff member
// is actually responsible for (should be billed for) each real email --
// used by app/api/time-entries/auto-generate before drafting.
//
// Confirmed live against Huynh Lawyers' real data: the same real email
// lands as a separate project_emails row PER STAFF MEMBER whose own Gmail
// mailbox it was synced+assigned from (e.g. everyone cc'd on a thread) --
// 173 of 189 rows on one day were duplicates of just 39 real emails. Naively
// treating each row as its own email both wildly over-counts time and
// attributes entries to people who were never actually a party to the
// correspondence (a duplicate copy landing in their own synced mailbox is
// not the same thing as them being the sender or the addressee).
//
// Grouping is by content_id (project_email_content.id, see migration
// 20260804050000_project_email_content_dedup.sql), not a locally
// recomputed subject+from_address+snippet+project_id fingerprint -- that
// used to be duplicated logic living only here; now it's resolved once,
// server-side, by a trigger every project_emails write already goes
// through, so this file and the DB can't quietly drift apart on what
// counts as "the same real email".
//
// Attribution order (deliberately never falls back to "whoever's mailbox
// happened to sync this row" -- that's the exact bug this replaces):
//   1. Sender is one of our own staff (from_address matches a company
//      profile's email) -- they're the timekeeper, full stop.
//   2. Otherwise the email was received from outside -- the salutation at
//      the start of the snippet ("Hi Tommy", "Dear Katherine, ...") names
//      who it's addressed to. Confirmed live: Gmail's own snippet field
//      reliably captures the opening line, so this needs no separate fetch
//      of the full message body. Two names joined by "and" (a real
//      multi-addressee greeting, e.g. "Hi Tommy and Katherine") -- take the
//      first that matches a staff member, per instruction. A name that
//      merely follows a comma is NOT treated as a second addressee (e.g.
//      "Dear Tommy, Thank you for..." must not read "Thank" as a name).
//   3. No name in the salutation (or it doesn't match any staff member) --
//      walk backward through the same Gmail thread (gmail_thread_id) to the
//      most recent earlier message actually SENT by one of our staff, and
//      attribute to them (whoever's been carrying the conversation on our
//      side is the most likely owner of this reply).
//   4. Still nothing -- returned with timekeeperUserId: null rather than
//      guessed OR dropped. The caller (app/api/time-entries/auto-generate)
//      surfaces these in the admin "everyone's day" view only, letting a
//      human pick who it actually belongs to instead of the system either
//      inventing an answer or silently losing the email from view.
export interface RawProjectEmail {
  id: string;
  // project_email_content.id -- groups this row with every other copy of
  // the same real email. Falls back to `id` itself (never grouped with
  // anything else) if a row somehow predates the backfill/trigger and has
  // none, rather than throwing away rows with a missing key.
  contentId: string | null;
  subject: string | null;
  snippet: string | null;
  from_address: string | null;
  from_name: string | null;
  project_id: string;
  gmail_thread_id: string | null;
  created_at: string;
}

export interface StaffMember {
  userId: string;
  email: string;
  firstName: string;
  fullName: string;
}

export interface AttributedEmail {
  id: string; // representative row id (the one whose subject/snippet is shown)
  // Every project_emails row this collapsed -- ALL of them get claimed in
  // time_entry_ai_sources on submit, so no duplicate copy can resurface in
  // a later run.
  duplicateIds: string[];
  subject: string | null;
  snippet: string | null;
  fromName: string | null;
  projectId: string;
  // null when none of the 3 attribution rules resolved anyone -- see
  // rule 4 in the header comment.
  timekeeperUserId: string | null;
}

// Only a literal " and " joins a second addressee -- a comma is far too
// common in ordinary email prose right after the greeting name (see header
// comment) to treat as "there's a second person being addressed" on its own.
const SALUTATION_RE = /^(?:hi|hello|hey|dear)\s+([a-z]+)(?:\s+and\s+([a-z]+))?/i;

function extractSalutationFirstNames(snippet: string | null): string[] {
  if (!snippet) return [];
  const match = snippet.trim().match(SALUTATION_RE);
  if (!match) return [];
  return [match[1], match[2]].filter((s): s is string => !!s);
}

export function dedupeAndAttributeEmails(
  rawEmails: RawProjectEmail[],
  staff: StaffMember[],
  alreadyConvertedIds: Set<string>
): AttributedEmail[] {
  const staffByEmail = new Map(staff.map(s => [s.email.toLowerCase(), s]));
  const staffByFirstName = new Map<string, StaffMember[]>();
  for (const s of staff) {
    const key = s.firstName.toLowerCase();
    if (!staffByFirstName.has(key)) staffByFirstName.set(key, []);
    staffByFirstName.get(key)!.push(s);
  }

  const groups = new Map<string, RawProjectEmail[]>();
  for (const e of rawEmails) {
    const key = e.contentId || e.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  // Every email in the fetched batch, per thread, oldest first -- used by
  // the thread-walk fallback. Deliberately built from the FULL raw set (not
  // deduped), since an earlier message in the thread may itself have
  // duplicate copies too; any one of them naming a staff sender is enough.
  const threadMessages = new Map<string, RawProjectEmail[]>();
  for (const e of rawEmails) {
    if (!e.gmail_thread_id) continue;
    if (!threadMessages.has(e.gmail_thread_id)) threadMessages.set(e.gmail_thread_id, []);
    threadMessages.get(e.gmail_thread_id)!.push(e);
  }
  for (const arr of threadMessages.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const results: AttributedEmail[] = [];
  for (const group of groups.values()) {
    const duplicateIds = group.map(g => g.id);
    // Already converted (by anyone, any prior run) -- every copy is done,
    // never resurface any of them.
    if (duplicateIds.some(id => alreadyConvertedIds.has(id))) continue;

    const rep = group[0];
    let timekeeper: StaffMember | undefined = staffByEmail.get((rep.from_address || "").toLowerCase());

    if (!timekeeper) {
      for (const name of extractSalutationFirstNames(rep.snippet)) {
        const candidates = staffByFirstName.get(name.toLowerCase());
        if (candidates?.length) { timekeeper = candidates[0]; break; }
      }
    }

    if (!timekeeper && rep.gmail_thread_id) {
      const thread = threadMessages.get(rep.gmail_thread_id) || [];
      const repIdx = thread.findIndex(t => t.id === rep.id);
      for (let i = repIdx - 1; i >= 0; i--) {
        const s = staffByEmail.get((thread[i].from_address || "").toLowerCase());
        if (s) { timekeeper = s; break; }
      }
    }

    results.push({
      id: rep.id,
      duplicateIds,
      subject: rep.subject,
      snippet: rep.snippet,
      fromName: rep.from_name,
      projectId: rep.project_id,
      timekeeperUserId: timekeeper?.userId ?? null,
    });
  }
  return results;
}
