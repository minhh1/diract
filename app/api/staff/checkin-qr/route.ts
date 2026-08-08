// app/api/staff/checkin-qr/route.ts
// A QR code the caller can show on their own phone so the kiosk iPad's
// camera can identify them, instead of someone else tapping their name in
// the shift list (see components/kiosk/CheckInPanel.tsx's scan mode). The
// QR only identifies WHO -- it's not a secret and isn't itself sufficient to
// check someone in or out; the kiosk still asks for their PIN afterwards
// whenever one is set (see app/api/kiosk/checkins/route.ts), same trust
// model as a name badge plus a PIN pad.
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { findOwnStaffEntity } from "@/lib/services/staffEntityService";
import { buildCheckinQrPayload } from "@/lib/staffCheckinQr";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const entity = await findOwnStaffEntity(admin, companyId, user.id);
  if (!entity) return NextResponse.json({ error: "No staff profile found for your account" }, { status: 404 });

  const dataUrl = await QRCode.toDataURL(buildCheckinQrPayload(entity.id), { margin: 1, width: 320 });
  return NextResponse.json({ qrCode: dataUrl });
}
