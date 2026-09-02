import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createElement } from "react";

/**
 * D6's certificate PDF. No QR-code library is in this project's dependency
 * set (see package.json) — rather than pull in a new dependency for one
 * asset, the verification URL is printed as plain text, which every phone
 * camera and screen reader handles as well as a QR image would. The
 * signature-backed /verify/[id] page this points to is the actual source of
 * truth; the PDF is a presentation of it, per D6.
 */
const TYPE_LABELS: Record<string, string> = {
  contest_participation: "Certificate of Participation",
  contest_rank: "Certificate of Achievement",
  course_completion: "Certificate of Completion",
  season_achievement: "Season Achievement",
  problem_milestone: "Problem-Solving Milestone",
};

function styles() {
  return StyleSheet.create({
    page: { padding: 56, fontFamily: "Helvetica", alignItems: "center", justifyContent: "center" },
    border: { borderWidth: 2, borderColor: "#1f9e68", padding: 40, width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
    eyebrow: { fontSize: 11, color: "#5a6a7d", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 },
    title: { fontSize: 26, fontWeight: 700, marginBottom: 18, textAlign: "center" },
    name: { fontSize: 20, fontWeight: 700, marginBottom: 10, textAlign: "center" },
    body: { fontSize: 12, color: "#333333", textAlign: "center", marginBottom: 24, lineHeight: 1.5 },
    footer: { fontSize: 9, color: "#8894a0", marginTop: 20, textAlign: "center" },
  });
}

function describePayload(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "contest_rank":
      return `Ranked #${payload.rank} of ${payload.fieldSize} participants in "${payload.contestTitle}"`;
    case "contest_participation":
      return `Participated in "${payload.contestTitle}"`;
    case "course_completion":
      return `Completed ${payload.courseCode ?? ""} — ${payload.sectionName ?? ""}`.trim();
    case "season_achievement":
      return `${payload.achievement ?? "Season achievement"} in ${payload.seasonName ?? "this season"}`;
    case "problem_milestone":
      return `Solved ${payload.milestone ?? ""} problems`;
    default:
      return "";
  }
}

export async function renderCertificatePdf(opts: {
  userName: string;
  type: string;
  payload: Record<string, unknown>;
  issuedAt: Date;
  verifyUrl: string;
}): Promise<Buffer> {
  const s = styles();
  const doc = createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "A4", orientation: "landscape", style: s.page },
      createElement(
        View,
        { style: s.border },
        createElement(Text, { style: s.eyebrow }, "DIU ContestHub"),
        createElement(Text, { style: s.title }, TYPE_LABELS[opts.type] ?? "Certificate"),
        createElement(Text, { style: s.name }, opts.userName),
        createElement(Text, { style: s.body }, describePayload(opts.type, opts.payload)),
        createElement(Text, { style: s.footer }, `Issued ${opts.issuedAt.toLocaleDateString()}`),
        createElement(Text, { style: s.footer }, `Verify at ${opts.verifyUrl}`)
      )
    )
  );

  return Buffer.from(await renderToBuffer(doc));
}
