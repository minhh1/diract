#!/usr/bin/env npx tsx
// scripts/checkCourtForms.ts
// Checks whether any official court form we ship has been amended.
//
// Court forms are versioned and republished, and a document filed on a
// superseded form gets rejected at the registry. The copies in
// lib/precedents/forms are pinned, so nothing here changes on its own -- which
// is what we want, and also why drift is silent. This makes it loud.
//
// Compares the hash of the file AS PUBLISHED against sourceSha256 in the
// manifest. That is deliberately not the hash of the file in the repo: most
// NSW forms are published as .doc and we store a converted .docx, so the two
// never match. Conversion is not reproducible byte-for-byte either, so
// hashing our own converted output would produce false alarms.
//
//   npx tsx scripts/checkCourtForms.ts          # report, exit 1 on change
//   npx tsx scripts/checkCourtForms.ts --adopt  # record current hashes
//
// --adopt is for the first run and after a form has been deliberately
// updated. It records what is published now; it does NOT download the new
// form into the repo, because adopting a new form means re-converting it and
// re-checking the precedent that uses it, which is a human decision.
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MANIFEST = join(process.cwd(), "lib/precedents/forms/manifest.json");

interface FormEntry {
  id: string;
  name: string;
  form: string;
  rule: string;
  file: string;
  sourceUrl: string;
  obtainedOn: string;
  storedSha256: string;
  sourceSha256: string | null;
  convertedFromDoc: boolean;
}

interface Manifest {
  _comment: string;
  checkedInto: string;
  forms: FormEntry[];
}

type Result =
  | { entry: FormEntry; status: "unchanged" }
  | { entry: FormEntry; status: "changed"; sha: string }
  | { entry: FormEntry; status: "adopted"; sha: string }
  | { entry: FormEntry; status: "unreachable"; detail: string };

async function fetchSha(url: string): Promise<{ sha: string } | { error: string }> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const bytes = Buffer.from(await res.arrayBuffer());
    // A courts site that serves an HTML error page with a 200 would otherwise
    // read as "the form changed" every single day.
    if (bytes.length < 4096) return { error: `suspiciously small (${bytes.length} bytes)` };
    const head = bytes.subarray(0, 8).toString("latin1");
    const isZip = head.startsWith("PK");
    const isOle2 = head.startsWith("\xd0\xcf\x11\xe0");
    if (!isZip && !isOle2) return { error: "not a Word document (probably an error page)" };
    return { sha: createHash("sha256").update(bytes).digest("hex") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fetch failed" };
  }
}

async function main() {
  const adopt = process.argv.includes("--adopt");
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const results: Result[] = [];

  for (const entry of manifest.forms) {
    const got = await fetchSha(entry.sourceUrl);
    if ("error" in got) {
      results.push({ entry, status: "unreachable", detail: got.error });
      continue;
    }
    if (entry.sourceSha256 === null || adopt) {
      entry.sourceSha256 = got.sha;
      results.push({ entry, status: adopt && entry.sourceSha256 ? "adopted" : "adopted", sha: got.sha });
      continue;
    }
    results.push(
      got.sha === entry.sourceSha256
        ? { entry, status: "unchanged" }
        : { entry, status: "changed", sha: got.sha }
    );
  }

  const changed = results.filter(r => r.status === "changed");
  const unreachable = results.filter(r => r.status === "unreachable");
  const adopted = results.filter(r => r.status === "adopted");

  for (const r of results) {
    const tag =
      r.status === "unchanged" ? "  ok      " :
      r.status === "changed"   ? "  CHANGED " :
      r.status === "adopted"   ? "  adopted " : "  UNREACHABLE ";
    const extra =
      r.status === "unreachable" ? ` (${r.detail})` :
      r.status === "changed" ? `\n            was ${r.entry.sourceSha256}\n            now ${r.sha}` : "";
    console.log(`${tag} ${r.entry.id.padEnd(18)} ${r.entry.form}${extra}`);
  }

  if (adopted.length) {
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`\nRecorded published hashes for ${adopted.length} form(s) in manifest.json.`);
  }

  console.log(
    `\n${results.length} forms checked: ${results.length - changed.length - unreachable.length - adopted.length} unchanged, ` +
    `${changed.length} changed, ${unreachable.length} unreachable.`
  );

  if (changed.length) {
    console.log(
      "\nA form has been amended. For each one:\n" +
      "  1. Download the new form from its sourceUrl.\n" +
      "  2. Convert it to .docx if it is published as .doc (docservice/, diract-docservice.fly.dev).\n" +
      "  3. Replace the file in lib/precedents/forms and update the version in\n" +
      "     lib/precedents/forms/nsw/README.md and the precedent's reviewNote.\n" +
      "  4. Re-run with --adopt to record the new hash."
    );
    process.exit(1);
  }
  // Unreachable is not a failure: courts sites move files and go down, and a
  // red build every time one does would train everyone to ignore this.
  if (unreachable.length) console.log("\nSome sources were unreachable; not treating that as a change.");
}

main();
