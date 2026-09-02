import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createElement } from "react";

/** D2's report — lists CONFIRMED/ESCALATED pairs only, per copy guidance
 * ("needs review", not "cheating detected"): this is the export a teacher
 * takes to an academic-conduct meeting, so it shows the cases already acted
 * on rather than every raw score. */
export type IntegrityReportPair = {
  problemTitle: string;
  studentAName: string;
  studentBName: string;
  similarity: number;
  zScore: number;
  status: string;
};

function styles() {
  return StyleSheet.create({
    page: { padding: 32, fontFamily: "Helvetica", fontSize: 10 },
    h1: { fontSize: 18, marginBottom: 4, fontWeight: 700 },
    muted: { color: "#666666", fontSize: 9, marginBottom: 12 },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#dddddd", paddingVertical: 4 },
    cell: { flex: 1 },
    cellWide: { flex: 2 },
    empty: { marginTop: 8, color: "#666666" },
  });
}

export async function renderIntegrityReportPdf(opts: {
  scopeLabel: string;
  generatedAt: Date;
  pairs: IntegrityReportPair[];
}): Promise<Buffer> {
  const s = styles();
  const doc = createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "A4", style: s.page },
      createElement(Text, { style: s.h1 }, "Academic integrity report"),
      createElement(
        Text,
        { style: s.muted },
        `${opts.scopeLabel} · generated ${opts.generatedAt.toLocaleString()}`
      ),
      opts.pairs.length === 0
        ? createElement(Text, { style: s.empty }, "No confirmed or escalated pairs.")
        : createElement(
            View,
            {},
            createElement(
              View,
              { style: s.row },
              createElement(Text, { style: s.cellWide }, "Problem"),
              createElement(Text, { style: s.cellWide }, "Students"),
              createElement(Text, { style: s.cell }, "Similarity"),
              createElement(Text, { style: s.cell }, "Z-score"),
              createElement(Text, { style: s.cell }, "Status")
            ),
            ...opts.pairs.map((p, i) =>
              createElement(
                View,
                { style: s.row, key: i },
                createElement(Text, { style: s.cellWide }, p.problemTitle),
                createElement(Text, { style: s.cellWide }, `${p.studentAName} / ${p.studentBName}`),
                createElement(Text, { style: s.cell }, `${Math.round(p.similarity * 100)}%`),
                createElement(Text, { style: s.cell }, p.zScore.toFixed(1)),
                createElement(Text, { style: s.cell }, p.status)
              )
            )
          )
    )
  );

  return Buffer.from(await renderToBuffer(doc));
}
