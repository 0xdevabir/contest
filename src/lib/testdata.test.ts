import { describe, expect, it } from "vitest";
import { crc32 } from "zlib";
import { MAX_CASES, parseTestDataZip } from "./testdata";

/** Minimal stored (uncompressed) ZIP writer — enough to exercise
 * parseTestDataZip without pulling in a zip-writing dependency. */
function buildZip(files: { name: string; content: string }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const dataBuf = Buffer.from(file.content, "utf8");
    const crc = crc32(dataBuf) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, dataBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + dataBuf.length;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(localBuf.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, end]);
}

describe("parseTestDataZip", () => {
  it("pairs 1.in/1.out naming convention", async () => {
    const zip = buildZip([
      { name: "1.in", content: "2 3\n" },
      { name: "1.out", content: "5\n" },
      { name: "2.in", content: "4 4\n" },
      { name: "2.out", content: "8\n" },
    ]);
    const result = await parseTestDataZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.errors).toHaveLength(0);
    expect(result.cases).toHaveLength(2);
    expect(result.cases[0].input.toString("utf8")).toBe("2 3\n");
    expect(result.cases[0].expected.toString("utf8")).toBe("5\n");
  });

  it("pairs 01.in/01.a naming convention", async () => {
    const zip = buildZip([
      { name: "01.in", content: "hello\n" },
      { name: "01.a", content: "world\n" },
    ]);
    const result = await parseTestDataZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases).toHaveLength(1);
  });

  it("pairs input1.txt/output1.txt naming convention", async () => {
    const zip = buildZip([
      { name: "input1.txt", content: "a\n" },
      { name: "output1.txt", content: "b\n" },
    ]);
    const result = await parseTestDataZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases).toHaveLength(1);
  });

  it("reports an unpaired file as an error without failing the whole batch", async () => {
    const zip = buildZip([
      { name: "1.in", content: "a\n" },
      { name: "1.out", content: "b\n" },
      { name: "2.in", content: "c\n" },
    ]);
    const result = await parseTestDataZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/missing paired/i);
  });

  it("rejects zip-slip path traversal entries", async () => {
    const zip = buildZip([
      { name: "../../etc/passwd", content: "root:x:0:0\n" },
      { name: "1.in", content: "a\n" },
      { name: "1.out", content: "b\n" },
    ]);
    const result = await parseTestDataZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases).toHaveLength(1);
    expect(result.errors.some((e) => e.message.includes("zip-slip"))).toBe(true);
  });

  it("normalizes CRLF line endings and ensures a trailing newline on input", async () => {
    const zip = buildZip([
      { name: "1.in", content: "line1\r\nline2" },
      { name: "1.out", content: "ok\r\n" },
    ]);
    const result = await parseTestDataZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases[0].input.toString("utf8")).toBe("line1\nline2\n");
    expect(result.cases[0].expected.toString("utf8")).toBe("ok\n");
  });

  it("fails fatally when the case count exceeds MAX_CASES", async () => {
    const files: { name: string; content: string }[] = [];
    for (let i = 1; i <= MAX_CASES + 1; i++) {
      files.push({ name: `${i}.in`, content: `${i}\n` }, { name: `${i}.out`, content: `${i}\n` });
    }
    const zip = buildZip(files);
    const result = await parseTestDataZip(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fatal).toBe(true);
  });

  it("skips macOS metadata noise without erroring", async () => {
    const zip = buildZip([
      { name: "__MACOSX/._1.in", content: "junk" },
      { name: ".DS_Store", content: "junk" },
      { name: "1.in", content: "a\n" },
      { name: "1.out", content: "b\n" },
    ]);
    const result = await parseTestDataZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});
