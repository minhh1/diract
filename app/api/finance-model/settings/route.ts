// app/api/finance-model/settings/route.ts
// GET/PATCH for the one-row-per-project "Finance Model Settings" custom
// table -- currently just gst_method, read by the Feasibility subtab to
// decide how to compute GST Collected/Input Tax Credits from the
// project's Budget Lines. GET returns { gstMethod: null } if no row
// exists yet (never auto-created -- PATCH creates it on first save).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow } from "@/lib/customTableAdmin";
import { SETTINGS_SLUG } from "@/lib/financeModel/data";

const GST_METHODS = ["Margin Scheme", "Standard (1/11th)", "GST-free"];

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, SETTINGS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Settings table is not provisioned" }, { status: 500 });

  const rows = await listCustomTableRows(admin, table, "project", projectId);
  return NextResponse.json({ gstMethod: rows[0]?.gst_method ?? null });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  const gstMethod: string | undefined = body?.gstMethod;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (gstMethod && !GST_METHODS.includes(gstMethod)) return NextResponse.json({ error: `gstMethod must be one of: ${GST_METHODS.join(", ")}` }, { status: 400 });

  const table = await getCustomTable(admin, companyId, SETTINGS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Settings table is not provisioned" }, { status: 500 });

  const rows = await listCustomTableRows(admin, table, "project", projectId);
  if (rows[0]) {
    await updateCustomTableRow(admin, table, rows[0].id, { gst_method: gstMethod || null });
  } else {
    await createCustomTableRow(admin, table, user.id, { project: projectId, gst_method: gstMethod || null });
  }

  return NextResponse.json({ success: true });
}
