import { describe, it, expect } from "vitest";
import { checkExact } from "./exact";
import { checkToken } from "./token";
import { checkFloat } from "./float";

describe("checkExact", () => {
  it("accepts byte-identical output", () => {
    expect(checkExact("8\n", "8\n")).toBe("AC");
  });

  it("normalises CRLF and one trailing newline", () => {
    expect(checkExact("8\n", "8\r\n")).toBe("AC");
    expect(checkExact("8", "8\n")).toBe("AC");
  });

  it("rejects a trailing space TOKEN would forgive", () => {
    expect(checkExact("8\n", "8 \n")).toBe("WA");
  });
});

describe("checkToken", () => {
  it("forgives trailing whitespace and line-ending differences", () => {
    expect(checkToken("1 2 3\n", "1 2 3   \r\n")).toBe("AC");
  });

  it("forgives extra internal whitespace and different line breaks", () => {
    expect(checkToken("1\n2\n3", "1 2 3")).toBe("AC");
  });

  it("rejects a different token sequence", () => {
    expect(checkToken("1 2 3", "1 2 4")).toBe("WA");
  });

  it("rejects a different token count", () => {
    expect(checkToken("1 2 3", "1 2")).toBe("WA");
  });
});

describe("checkFloat", () => {
  it("accepts a value within absolute epsilon", () => {
    expect(checkFloat("3.14159", "3.14160", 1e-4)).toBe("AC");
  });

  it("rejects a value outside epsilon", () => {
    expect(checkFloat("3.14159", "3.2", 1e-4)).toBe("WA");
  });

  it("accepts comfortably within the epsilon boundary", () => {
    expect(checkFloat("1.0", "1.000001", 1e-5)).toBe("AC");
  });

  it("mixes numeric tolerance with exact non-numeric tokens", () => {
    expect(checkFloat("answer: 2.0", "answer: 2.0000001", 1e-6)).toBe("AC");
    expect(checkFloat("answer: 2.0", "result: 2.0", 1e-6)).toBe("WA");
  });

  it("uses relative tolerance for large magnitudes", () => {
    expect(checkFloat("1000000", "1000005", 1e-5)).toBe("AC");
  });
});
