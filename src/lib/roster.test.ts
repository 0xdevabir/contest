import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseRoster } from "./roster";
import { toCsv, toCsvResponseBody, parseCsv, CSV_BOM } from "./csv";

const REGISTRAR_CSV = `Sl,Student ID,Name,Email,Program\r\n1,221-15-4567,Md. Rafiul Islam,rafiul15-4567@diu.edu.bd,BSc CSE\r\n2,221-15-4568,মোঃ করিম,karim@diu.edu.bd,BSc CSE\r\n`;

describe("parseRoster (CSV)", () => {
  it("detects registrar-style headers and rows, including CRLF and Bangla names", () => {
    const parsed = parseRoster(Buffer.from(REGISTRAR_CSV, "utf-8"), "roster.csv");
    expect(parsed.mapping.studentId).toBe("Student ID");
    expect(parsed.mapping.email).toBe("Email");
    expect(parsed.mapping.name).toBe("Name");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]["Email"]).toBe("rafiul15-4567@diu.edu.bd");
    expect(parsed.rows[1]["Name"]).toBe("মোঃ করিম");
  });

  it("handles a BOM-prefixed file", () => {
    const withBom = CSV_BOM + REGISTRAR_CSV;
    const parsed = parseRoster(Buffer.from(withBom, "utf-8"), "roster.csv");
    expect(parsed.rows).toHaveLength(2);
    expect(Object.keys(parsed.rows[0])[0]).not.toContain("﻿");
  });

  it("warns when headers are missing / ambiguous", () => {
    const parsed = parseRoster(Buffer.from("Col1,Col2\r\nfoo,bar\r\n", "utf-8"), "roster.csv");
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.mapping.email).toBeUndefined();
    expect(parsed.mapping.studentId).toBeUndefined();
  });

  it("does not crash on duplicate emails in the file (dedup handled by applyRoster, not parsing)", () => {
    const csv = "Email,Name\r\na@x.com,A\r\na@x.com,A2\r\n";
    const parsed = parseRoster(Buffer.from(csv, "utf-8"), "roster.csv");
    expect(parsed.rows).toHaveLength(2);
  });
});

describe("parseRoster (xlsx)", () => {
  it("reads the first sheet of a real workbook", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Student ID", "Name", "Email"],
      ["221-15-9999", "Jane Doe", "jane@diu.edu.bd"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const parsed = parseRoster(buf, "roster.xlsx");
    expect(parsed.mapping.studentId).toBe("Student ID");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]["Email"]).toBe("jane@diu.edu.bd");
  });
});

describe("csv helpers", () => {
  it("round-trips quoted fields with commas and quotes", () => {
    const rows = [
      ["Name", "Note"],
      ["Md. Rafiul, Jr.", 'He said "hi"'],
    ];
    const csv = toCsv(rows);
    const parsed = parseCsv(csv);
    expect(parsed).toEqual(rows);
  });

  it("prefixes a UTF-8 BOM for Excel", () => {
    const body = toCsvResponseBody([["মোঃ করিম", "100"]]);
    expect(body.startsWith(CSV_BOM)).toBe(true);
    expect(body).toContain("মোঃ করিম");
  });
});
