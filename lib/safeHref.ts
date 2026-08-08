// lib/safeHref.ts
// Strict URL scheme allowlist for content whose source isn't a trusted admin
// typing into a settings form -- AI-generated page blocks (see
// lib/pages/validateBlocks.ts) can, in principle, be steered by a crafted
// prompt into emitting a javascript:/data: URL on a button or image. This
// rejects anything but http(s) outright.
//
// Uses the WHATWG URL parser (via the built-in URL constructor) rather than
// a regex -- browsers strip ASCII tab/newline from a URL before reading its
// scheme (a known javascript: filter bypass against naive regexes, e.g.
// "java\tscript:alert(1)"), and URL parsing does the same normalization, so
// this can't be fooled the same way a regex check could.
//
// Distinct from lib/signature/renderSignatureHtml.ts's own safeHref, which
// deliberately only HTML-escapes rather than validating scheme -- that
// context is a company admin's own typed-in signature links, a different
// (already-trusted) source than model output; see that file's comment.
export function safeHref(url: string | null | undefined): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed, "https://placeholder.invalid");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return trimmed;
  } catch {
    return "";
  }
}
