import fs from "node:fs";
import path from "node:path";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { createElement } from "react";
import { log } from "../log";
import type { SectionSummary } from "./cohort";
import type { StudentDeepDive } from "./student";

/**
 * Bangla names render as tofu boxes without a Bangla-capable font embedded —
 * PHASE-08 D/Risks calls this out explicitly. We register
 * public/fonts/NotoSansBengali-Regular.ttf when present; the font binary
 * itself isn't checked into this change (no network fetch of binary assets
 * in this environment) — see docs/RUNBOOK.md for the one-time step to add
 * it. Until then, PDFs fall back to Helvetica and Bangla text degrades to
 * boxes rather than the export silently failing.
 */
const BANGLA_FONT_PATH = path.join(process.cwd(), "public", "fonts", "NotoSansBengali-Regular.ttf");
let banglaFontRegistered = false;
let banglaFontAvailable = false;

function ensureFont(): boolean {
  if (banglaFontRegistered) return banglaFontAvailable;
  banglaFontRegistered = true;
  try {
    if (fs.existsSync(BANGLA_FONT_PATH)) {
      Font.register({ family: "NotoSansBengali", src: BANGLA_FONT_PATH });
      banglaFontAvailable = true;
    } else {
      log.warn("analytics PDF export: Bangla font asset missing, falling back to Helvetica", {
        expectedPath: BANGLA_FONT_PATH,
      });
    }
  } catch (err) {
    log.warn("analytics PDF export: font registration failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return banglaFontAvailable;
}

function fontFamily(): string {
  return ensureFont() ? "NotoSansBengali" : "Helvetica";
}

function styles() {
  return StyleSheet.create({
    page: { padding: 32, fontFamily: fontFamily(), fontSize: 10 },
    h1: { fontSize: 18, marginBottom: 4, fontWeight: 700 },
    h2: { fontSize: 12, marginTop: 12, marginBottom: 6, fontWeight: 700 },
    muted: { color: "#666666", fontSize: 9, marginBottom: 8 },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#dddddd", paddingVertical: 4 },
    cell: { flex: 1 },
    cellWide: { flex: 2 },
  });
}

export async function renderClassReportPdf(opts: {
  courseCode: string;
  sectionName: string;
  semesterName: string;
  teacherName: string;
  summary: SectionSummary;
  students: { name: string; total: number | null }[];
}): Promise<Buffer> {
  const s = styles();
  const doc = createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "A4", style: s.page },
      createElement(Text, { style: s.h1 }, `${opts.courseCode} — ${opts.sectionName}`),
      createElement(Text, { style: s.muted }, `${opts.semesterName} · ${opts.teacherName} · generated ${new Date().toLocaleString()}`),

      createElement(Text, { style: s.h2 }, "Cohort summary"),
      createElement(
        Text,
        {},
        `${opts.summary.activeStudents}/${opts.summary.totalStudents} active students this fortnight · median solved ${opts.summary.medianSolved} · ${opts.summary.submissionsThisWeek} submissions this week`
      ),

      createElement(Text, { style: s.h2 }, "Weakest topics"),
      ...opts.summary.weakTags.slice(0, 8).map((t) =>
        createElement(Text, { key: t.tagId }, `${t.name} — ${Math.round(t.mastery * 100)}% mastery (n=${t.sampleSize})`)
      ),

      createElement(Text, { style: s.h2 }, "Students"),
      createElement(
        View,
        { style: s.row },
        createElement(Text, { style: s.cellWide }, "Name"),
        createElement(Text, { style: s.cell }, "Total (%)")
      ),
      ...opts.students.map((st, i) =>
        createElement(
          View,
          { style: s.row, key: i },
          createElement(Text, { style: s.cellWide }, st.name),
          createElement(Text, { style: s.cell }, st.total != null ? String(Math.round(st.total * 100) / 100) : "—")
        )
      )
    )
  );

  return Buffer.from(await renderToBuffer(doc));
}

export async function renderStudentReportPdf(opts: {
  courseCode: string;
  sectionName: string;
  student: StudentDeepDive;
}): Promise<Buffer> {
  const s = styles();
  const doc = createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "A4", style: s.page },
      createElement(Text, { style: s.h1 }, opts.student.name),
      createElement(Text, { style: s.muted }, `${opts.courseCode} — ${opts.sectionName} · ${opts.student.email} · generated ${new Date().toLocaleString()}`),

      createElement(Text, { style: s.h2 }, "Assignment history"),
      ...opts.student.assignmentHistory.map((a) =>
        createElement(
          Text,
          { key: a.assignmentId },
          `${a.title} — ${a.percent != null ? Math.round(a.percent) + "%" : "not started"}`
        )
      ),

      createElement(Text, { style: s.h2 }, "Weakest topics"),
      ...opts.student.tagMastery.slice(0, 8).map((t) =>
        createElement(Text, { key: t.tagId }, `${t.name} — ${Math.round(t.mastery * 100)}% mastery (${t.solved}/${t.attempted})`)
      ),

      createElement(Text, { style: s.h2 }, "Recent activity") ,
      createElement(
        Text,
        {},
        `Median attempts-to-AC: ${opts.student.attemptsDistribution.userMedian ?? "—"} (class median: ${opts.student.attemptsDistribution.cohortMedian ?? "—"})`
      )
    )
  );

  return Buffer.from(await renderToBuffer(doc));
}
