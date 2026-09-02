/** Byte-identical after normalising `\r\n` -> `\n` and stripping one trailing newline. */
export function checkExact(expected: string, actual: string): "AC" | "WA" {
  const norm = (s: string) => s.replace(/\r\n/g, "\n").replace(/\n$/, "");
  return norm(expected) === norm(actual) ? "AC" : "WA";
}
