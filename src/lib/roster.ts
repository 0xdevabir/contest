import * as XLSX from "xlsx";
import { prisma } from "./db";
import { parseCsv } from "./csv";

export type RawRow = Record<string, string>;

export type ColumnMapping = {
  email?: string;
  studentId?: string;
  name?: string;
};

export type RosterOutcome = "matched" | "invited" | "duplicate" | "invalid";

export type RosterRow = {
  line: number;
  email?: string;
  studentId?: string;
  name?: string;
  outcome: RosterOutcome;
  reason?: string;
  userId?: string;
};

const HEADER_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  studentId: ["student id", "id", "roll", "registration", "reg", "student_id", "sl"],
  email: ["email", "e-mail", "mail"],
  name: ["name", "student name", "full name"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectColumns(headerRow: string[]): { mapping: ColumnMapping; detectedColumns: Record<string, number> } {
  const mapping: ColumnMapping = {};
  const detectedColumns: Record<string, number> = {};
  const normalized = headerRow.map(normalizeHeader);

  (Object.keys(HEADER_SYNONYMS) as (keyof ColumnMapping)[]).forEach((key) => {
    const synonyms = HEADER_SYNONYMS[key];
    // Prefer an exact synonym match; "id" is deliberately last for studentId
    // so it doesn't shadow a more specific "email"/"name" column.
    for (const syn of synonyms) {
      const idx = normalized.indexOf(syn);
      if (idx !== -1) {
        mapping[key] = headerRow[idx];
        detectedColumns[key] = idx;
        return;
      }
    }
  });

  return { mapping, detectedColumns };
}

/** Detects whether the first row looks like a header (mostly non-numeric cells) vs. data. */
function looksLikeHeader(row: string[]): boolean {
  if (row.length === 0) return false;
  const numericish = row.filter((c) => /^\s*[\d.\-]+\s*$/.test(c)).length;
  return numericish < row.length / 2;
}

export type ParsedRoster = {
  detectedColumns: Record<string, number>;
  mapping: ColumnMapping;
  rows: RawRow[];
  warnings: string[];
};

export function parseRoster(file: Buffer, filename: string): ParsedRoster {
  const warnings: string[] = [];
  let grid: string[][];

  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = XLSX.read(file, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return { detectedColumns: {}, mapping: {}, rows: [], warnings: ["The workbook has no sheets."] };
    }
    const sheet = wb.Sheets[sheetName];
    grid = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][]).map(
      (row) => row.map((cell) => (cell == null ? "" : String(cell).trim()))
    );
  } else {
    const text = file.toString("utf-8");
    grid = parseCsv(text).map((row) => row.map((cell) => cell.trim()));
  }

  grid = grid.filter((row) => row.some((cell) => cell !== ""));
  if (grid.length === 0) {
    return { detectedColumns: {}, mapping: {}, rows: [], warnings: ["The file is empty."] };
  }

  const headerRow = grid[0];
  if (!looksLikeHeader(headerRow)) {
    warnings.push("Could not confidently detect a header row — using the first row as headers anyway.");
  }

  const { mapping, detectedColumns } = detectColumns(headerRow);
  if (!mapping.email && !mapping.studentId) {
    warnings.push("Neither an email nor a student ID column was detected — map columns manually.");
  }

  const rows: RawRow[] = grid.slice(1).map((row) => {
    const obj: RawRow = {};
    headerRow.forEach((h, idx) => {
      obj[h] = row[idx] ?? "";
    });
    return obj;
  });

  return { detectedColumns, mapping, rows, warnings };
}

export type ApplyRosterOptions = {
  mapping: ColumnMapping;
  dryRun: boolean;
  removeMissing?: boolean; // default false
};

export type ApplySummary = {
  matched: number;
  invited: number;
  duplicate: number;
  invalid: number;
  removed: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function applyRoster(
  sectionId: string,
  rows: RawRow[],
  opts: ApplyRosterOptions
): Promise<{ rows: RosterRow[]; summary: ApplySummary }> {
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    select: { course: { select: { department: { select: { institutionId: true } } } } },
  });
  if (!section) throw new Error("Section not found");
  const institutionId = section.course.department.institutionId;

  const existingEnrollments = await prisma.enrollment.findMany({
    where: { sectionId },
    select: { id: true, email: true, studentId: true, userId: true },
  });
  const existingByEmail = new Map(existingEnrollments.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]));
  const existingByStudentId = new Map(
    existingEnrollments.filter((e) => e.studentId).map((e) => [e.studentId!, e])
  );

  const result: RosterRow[] = [];
  const seenInFile = new Set<string>(); // email or studentId already handled this run, to catch in-file duplicates
  const summary: ApplySummary = { matched: 0, invited: 0, duplicate: 0, invalid: 0, removed: 0 };

  for (let i = 0; i < rows.length; i++) {
    const line = i + 2; // account for the header row
    const raw = rows[i];
    const email = opts.mapping.email ? raw[opts.mapping.email]?.trim() : undefined;
    const studentId = opts.mapping.studentId ? raw[opts.mapping.studentId]?.trim() : undefined;
    const name = opts.mapping.name ? raw[opts.mapping.name]?.trim() : undefined;

    if (!email && !studentId) {
      result.push({ line, name, outcome: "invalid", reason: "Missing both email and student ID" });
      summary.invalid++;
      continue;
    }
    if (email && !EMAIL_RE.test(email)) {
      result.push({ line, email, studentId, name, outcome: "invalid", reason: "Malformed email" });
      summary.invalid++;
      continue;
    }

    const dedupeKey = (email?.toLowerCase() ?? "") + "|" + (studentId ?? "");
    if (seenInFile.has(dedupeKey)) {
      result.push({ line, email, studentId, name, outcome: "duplicate", reason: "Duplicate row in this file" });
      summary.duplicate++;
      continue;
    }
    seenInFile.add(dedupeKey);

    const alreadyEnrolled =
      (email && existingByEmail.has(email.toLowerCase())) || (studentId && existingByStudentId.has(studentId));
    if (alreadyEnrolled) {
      result.push({ line, email, studentId, name, outcome: "duplicate", reason: "Already on the roster" });
      summary.duplicate++;
      continue;
    }

    // Match an existing user: email first, then (institutionId, studentId).
    let user = email
      ? await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })
      : null;
    if (!user && studentId) {
      user = await prisma.user.findFirst({
        where: { institutionId, studentId },
        select: { id: true },
      });
    }

    if (opts.dryRun) {
      result.push({
        line,
        email,
        studentId,
        name,
        outcome: user ? "matched" : "invited",
        userId: user?.id,
      });
      if (user) summary.matched++;
      else summary.invited++;
      continue;
    }

    if (user) {
      await prisma.enrollment.create({
        data: {
          sectionId,
          userId: user.id,
          email: email ?? null,
          studentId: studentId ?? null,
          name: name ?? null,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });
      result.push({ line, email, studentId, name, outcome: "matched", userId: user.id });
      summary.matched++;
    } else {
      await prisma.enrollment.create({
        data: {
          sectionId,
          email: email ?? null,
          studentId: studentId ?? null,
          name: name ?? null,
          status: "INVITED",
        },
      });
      result.push({ line, email, studentId, name, outcome: "invited" });
      summary.invited++;
    }
  }

  if (!opts.dryRun && opts.removeMissing) {
    const keptKeys = new Set(
      rows.map((raw) => {
        const email = opts.mapping.email ? raw[opts.mapping.email]?.trim().toLowerCase() : "";
        const studentId = opts.mapping.studentId ? raw[opts.mapping.studentId]?.trim() : "";
        return `${email ?? ""}|${studentId ?? ""}`;
      })
    );
    for (const e of existingEnrollments) {
      const key = `${e.email?.toLowerCase() ?? ""}|${e.studentId ?? ""}`;
      if (!keptKeys.has(key)) {
        await prisma.enrollment.update({
          where: { id: e.id },
          data: { status: "DROPPED", droppedAt: new Date() },
        });
        summary.removed++;
      }
    }
  }

  return { rows: result, summary };
}

/**
 * Links pending (INVITED) enrollments to a newly-registered/verified user.
 * Called from the registration/email-verification flow. Matches on verified
 * email first, then on (institutionId, studentId).
 */
export async function matchPendingEnrollments(user: {
  id: string;
  email: string;
  institutionId: string | null;
  studentId: string | null;
}): Promise<number> {
  const byEmail = await prisma.enrollment.findMany({
    where: { status: "INVITED", userId: null, email: user.email.toLowerCase() },
    select: { id: true, sectionId: true },
  });

  let byStudentId: { id: string; sectionId: string }[] = [];
  if (user.institutionId && user.studentId) {
    const candidates = await prisma.enrollment.findMany({
      where: { status: "INVITED", userId: null, studentId: user.studentId },
      select: { id: true, sectionId: true, section: { select: { course: { select: { department: { select: { institutionId: true } } } } } } },
    });
    byStudentId = candidates.filter((c) => c.section.course.department.institutionId === user.institutionId);
  }

  const toLink = new Map<string, string>(); // enrollmentId -> sectionId
  for (const e of byEmail) toLink.set(e.id, e.sectionId);
  for (const e of byStudentId) toLink.set(e.id, e.sectionId);

  if (toLink.size === 0) return 0;

  let linked = 0;
  for (const [enrollmentId, sectionId] of toLink) {
    // Skip if this user is already enrolled in that section (unique constraint guard).
    const dup = await prisma.enrollment.findUnique({
      where: { sectionId_userId: { sectionId, userId: user.id } },
      select: { id: true },
    });
    if (dup) continue;
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { userId: user.id, status: "ACTIVE", joinedAt: new Date() },
    });
    linked++;
  }
  return linked;
}
