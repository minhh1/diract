// app/api/client-update-pages/[id]/pin/route.ts
// Change (or regenerate) a page's PIN. Changing it doesn't invalidate a
// client's already-cached PIN client-side automatically -- see
// app/public/updates/[slug]/page.tsx's getCachedCode: the old cached value
// just gets rejected on their next visit and they're asked to re-enter,
// same as document_fill_pages' access_code behaviour.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  let pin: string;
  if (body.regenerate) {
    pin = randomPin();
  } else {
    pin = String(body.pin ?? "").trim();
    if (!/^[A-Za-z0-9]{4,10}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4–10 letters/numbers" }, { status: 400 });
    }
  }

  const { error } = await admin.from("client_update_pages").update({ access_code: pin }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "pin_changed", body.regenerate ? "Regenerated the PIN" : "Changed the PIN");

  return NextResponse.json({ ok: true, pin });
}
