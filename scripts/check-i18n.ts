/**
 * Phase 14 D1 CI check. `bn.ts` being typed as `Dict` already turns a
 * missing/renamed key into a TypeScript build error — this script catches
 * what the type system can't: keys `bn.ts` defines that `en.ts` doesn't
 * (dead translations that silently stopped being used), and any value left
 * byte-identical to English (a translation nobody's actually done yet).
 *
 * Run: `tsx scripts/check-i18n.ts`
 */
import { en } from "../src/i18n/en";
import { bn } from "../src/i18n/bn";

type Leaf = { path: string; value: string };

function flatten(obj: unknown, prefix = ""): Leaf[] {
  if (typeof obj === "string") return [{ path: prefix, value: obj }];
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      flatten(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [];
}

function main() {
  const enLeaves = new Map(flatten(en).map((l) => [l.path, l.value]));
  const bnLeaves = new Map(flatten(bn).map((l) => [l.path, l.value]));

  const staleInBn = [...bnLeaves.keys()].filter((k) => !enLeaves.has(k));
  const untranslated = [...enLeaves.entries()].filter(([k, v]) => bnLeaves.get(k) === v);
  const missingInBn = [...enLeaves.keys()].filter((k) => !bnLeaves.has(k));

  let failed = false;

  if (missingInBn.length) {
    // Shouldn't happen — `bn: Dict` makes this a compile error first — but
    // checked here too in case someone widens the type to work around it.
    failed = true;
    console.error(`Missing in bn.ts (${missingInBn.length}):`);
    for (const k of missingInBn) console.error(`  ${k}`);
  }

  if (staleInBn.length) {
    failed = true;
    console.error(`\nStray keys in bn.ts not present in en.ts (${staleInBn.length}):`);
    for (const k of staleInBn) console.error(`  ${k}`);
  }

  if (untranslated.length) {
    failed = true;
    console.error(`\nUntranslated (bn.ts matches en.ts verbatim) (${untranslated.length}):`);
    for (const [k, v] of untranslated) console.error(`  ${k} = ${JSON.stringify(v)}`);
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log(`OK — ${enLeaves.size} keys, all translated, no stray keys.`);
  }
}

main();
