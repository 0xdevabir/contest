/**
 * Token-wise like TOKEN, but a token that parses as a finite number on both
 * sides compares within epsilon (absolute or relative, whichever is looser)
 * instead of requiring an exact string match.
 */
export function checkFloat(expected: string, actual: string, epsilon: number): "AC" | "WA" {
  const tokens = (s: string) => s.split(/\s+/).filter((t) => t.length > 0);
  const e = tokens(expected);
  const a = tokens(actual);
  if (e.length !== a.length) return "WA";

  for (let i = 0; i < e.length; i++) {
    if (e[i] === a[i]) continue;
    const en = Number(e[i]);
    const an = Number(a[i]);
    const bothNumeric = e[i].trim() !== "" && a[i].trim() !== "" && Number.isFinite(en) && Number.isFinite(an);
    if (!bothNumeric) return "WA";
    const diff = Math.abs(en - an);
    const relOk = diff / Math.max(1, Math.abs(en)) <= epsilon;
    const absOk = diff <= epsilon;
    if (!relOk && !absOk) return "WA";
  }
  return "AC";
}
