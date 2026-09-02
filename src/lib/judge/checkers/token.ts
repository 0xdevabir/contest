/**
 * D5 — the sane default. Splits both on whitespace and compares token
 * sequences, forgiving trailing spaces and line-ending differences, which
 * are never the point of the problem.
 */
export function checkToken(expected: string, actual: string): "AC" | "WA" {
  const tokens = (s: string) => s.split(/\s+/).filter((t) => t.length > 0);
  const e = tokens(expected);
  const a = tokens(actual);
  if (e.length !== a.length) return "WA";
  for (let i = 0; i < e.length; i++) {
    if (e[i] !== a[i]) return "WA";
  }
  return "AC";
}
