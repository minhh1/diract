// app/api/precedents/cross-reference-check/route.ts
// Upload any .docx and get back a checked copy: broken clause/recital/
// schedule/annexure references and defined-term issues highlighted, each
// with a Word comment (authored as the firm's own name) explaining what's
// wrong. Not tied to the precedent library -- this checks whatever document
// a user hands it, not just precedents this company has issued.
import { NextRequest, NextResponse } from "next/server";
import PizZip from "pizzip";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { convertDocToDocx } from "@/lib/gotenberg";
import { extractParagraphs } from "@/lib/precedents/crossRefCheck/documentModel";
import { parseNumberingXml, parseNumberingStyles, computeNumbering } from "@/lib/precedents/crossRefCheck/numberingEngine";
import { detectReferences } from "@/lib/precedents/crossRefCheck/detectReferences";
import { checkDefinedTerms } from "@/lib/precedents/crossRefCheck/checkDefinedTerms";
import { markupDocx, type MarkupIssue } from "@/lib/precedents/crossRefCheck/markup";

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
  }

  let bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 8).equals(OLE2_SIGNATURE)) {
    try {
      bytes = Buffer.from(await convertDocToDocx(bytes, file.name));
    } catch (e) {
      const message = e instanceof Error ? e.message : "conversion failed";
      return NextResponse.json({ error: `That older .doc file could not be converted: ${message}` }, { status: 400 });
    }
  }
  if (!bytes.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    return NextResponse.json({ error: "That file is not a Word document" }, { status: 400 });
  }

  let zip: PizZip;
  try {
    zip = new PizZip(bytes);
  } catch {
    return NextResponse.json({ error: "That file could not be read as a Word document" }, { status: 400 });
  }
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) return NextResponse.json({ error: "That file has no document body" }, { status: 400 });

  const documentXml = documentFile.asText();
  const stylesXml = zip.file("word/styles.xml")?.asText() ?? "";
  const numberingXml = zip.file("word/numbering.xml")?.asText() ?? "<w:numbering/>";

  const paragraphs = extractParagraphs(documentXml);
  const numbering = parseNumberingXml(numberingXml);
  const numberingStyles = parseNumberingStyles(stylesXml);
  const numbered = computeNumbering(paragraphs, stylesXml, numbering, numberingStyles);

  const refIssues = detectReferences(paragraphs, numbered);
  const termIssues = checkDefinedTerms(paragraphs);

  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();
  const authorName = company?.name || "Cross-reference check";

  const markupIssues: MarkupIssue[] = [
    ...refIssues.map(i => ({ paragraphIndex: i.paragraphIndex, charOffset: i.charOffset, length: i.referenceText.length, commentText: i.message })),
    ...termIssues.map(i => ({ paragraphIndex: i.paragraphIndex, charOffset: i.charOffset, length: i.term.length, commentText: i.message })),
  ];
  const markedUp = markupDocx(bytes, markupIssues, authorName);

  const outName = `${file.name.replace(/\.docx?$/i, "")} (checked).docx`;

  return NextResponse.json({
    ok: true,
    issues: [
      ...refIssues.map(i => ({ kind: i.kind, text: i.referenceText, message: i.message, confidence: "high" as const })),
      ...termIssues.map(i => ({ kind: i.kind, text: i.term, message: i.message, confidence: i.confidence })),
    ],
    docx: markedUp.toString("base64"),
    filename: outName,
  });
}
