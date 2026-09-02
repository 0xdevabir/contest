/** UTF-8 BOM so Excel opens the file with non-ASCII (e.g. Bangla) names intact. */
export const CSV_BOM = "﻿";

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) => row.map((cell) => escapeCell(cell == null ? "" : String(cell))).join(","))
    .join("\r\n");
}

/** Ready to hand to a NextResponse body with `Content-Type: text/csv; charset=utf-8`. */
export function toCsvResponseBody(rows: (string | number | null | undefined)[][]): string {
  return CSV_BOM + toCsv(rows);
}

/**
 * Minimal RFC4180-ish CSV parser: quoted fields (with "" escaping), commas,
 * and both CRLF and LF line endings. Strips a leading BOM if present.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = input.length;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      if (input[i] === "\n") i++;
      pushRow();
      continue;
    }
    if (ch === "\n") {
      i++;
      pushRow();
      continue;
    }
    field += ch;
    i++;
  }
  // Trailing field/row, unless the input ended cleanly on a newline.
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
