// app/api/precedents/[id]/download/route.ts
// GET -> the precedent as a .docx on the firm's letterhead, with every
// fill-in left as a visible, yellow-highlighted [placeholder].
//
// Distinct from ./issue, which produces a real document for a real matter
// (resolves the client, the matter reference, the signers, records it against
// the file). This is the blank form: what a solicitor wants when they'd
// rather work in Word, or to see the precedent on the actual letterhead
// including the header art, which the browser preview can only stand in for.
// Also what the Teams/WhatsApp bot's send_blank_template action hands over
// (see lib/botEngine/handleMessage.ts) -- both go through the same
// lib/precedents/blankTemplate.ts builder.
//
// No PDF branch here on purpose -- .docx composition is pure JS, whereas PDF
// needs the LibreOffice conversion service (lib/gotenberg.ts), and a blank
// form is something you fill in, so Word is the useful format anyway.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { buildBlankPrecedentDocx } from "@/lib/precedents/blankTemplate";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const result = await buildBlankPrecedentDocx(admin, companyId, precedentId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${result.filename}.docx"`,
    },
  });
}
