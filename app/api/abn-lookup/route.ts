// On-demand ABN/ACN registry verification from any abn/acn-type custom field
// (see components/dashboard/FieldValueInput.tsx's "Verify" button). Any
// company member can look up -- no per-company setup, this just proxies the
// shared ABN_LOOKUP_GUID (see lib/abnLookup/lookup.ts) so it never reaches
// the browser.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { lookupAbn, lookupAcn } from "@/lib/abnLookup/lookup";
import { isValidABN, isValidACN } from "@/lib/validation/entityValidation";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const type: "abn" | "acn" | undefined = body?.type;
  const value: string | undefined = body?.value;

  if ((type !== "abn" && type !== "acn") || !value?.trim()) {
    return NextResponse.json({ error: "type ('abn'|'acn') and value are required" }, { status: 400 });
  }
  const valid = type === "abn" ? isValidABN(value) : isValidACN(value);
  if (!valid) {
    return NextResponse.json({ error: `Not a valid ${type.toUpperCase()} (fails the checksum)` }, { status: 400 });
  }

  try {
    const result = type === "abn" ? await lookupAbn(value) : await lookupAcn(value);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lookup failed" }, { status: 502 });
  }
}
