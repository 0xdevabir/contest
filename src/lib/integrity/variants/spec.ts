import { z } from "zod";
import { createHash } from "crypto";

/**
 * D3 v1 (narrow, per the doc's own scope note): integer/array parameters
 * only. `choice`/`permutation` cover the common "pick a small discrete
 * option" case without needing a full expression language.
 */
export const parameterSpecSchema = z.array(
  z.discriminatedUnion("kind", [
    z.object({ name: z.string().min(1), kind: z.literal("int-range"), min: z.number().int(), max: z.number().int() }),
    z.object({ name: z.string().min(1), kind: z.literal("choice"), options: z.array(z.union([z.string(), z.number()])).min(1) }),
    z.object({
      name: z.string().min(1),
      kind: z.literal("int-array"),
      length: z.number().int().min(1).max(100000),
      min: z.number().int(),
      max: z.number().int(),
    }),
    z.object({ name: z.string().min(1), kind: z.literal("permutation"), length: z.number().int().min(1).max(100000) }),
  ])
);

export type ParameterSpec = z.infer<typeof parameterSpecSchema>;
export type DrawnParameters = Record<string, number | string | number[]>;

/** Deterministic per-(template, user, scope) seed — the same student always
 * gets the same variant, and no two students draw the same one. */
export function deriveSeed(templateId: string, userId: string, scopeId: string, salt = ""): string {
  return createHash("sha256").update(`${templateId}:${userId}:${scopeId}:${salt}`).digest("hex");
}

/** mulberry32 — small, fast, deterministic (D1's determinism requirement
 * mirrored here: no Math.random, no wall-clock reads). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return h;
}

export function rngFromSeed(seed: string): () => number {
  return mulberry32(seedToInt(seed));
}

function drawInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function drawPermutation(rng: () => number, length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Draws concrete parameter values for one student's seed. Deterministic:
 * same seed + spec always produces the same parameters. */
export function drawParameters(spec: ParameterSpec, seed: string): DrawnParameters {
  const rng = rngFromSeed(seed);
  const out: DrawnParameters = {};
  for (const p of spec) {
    switch (p.kind) {
      case "int-range":
        out[p.name] = drawInt(rng, p.min, p.max);
        break;
      case "choice":
        out[p.name] = p.options[Math.floor(rng() * p.options.length)];
        break;
      case "int-array":
        out[p.name] = Array.from({ length: p.length }, () => drawInt(rng, p.min, p.max));
        break;
      case "permutation":
        out[p.name] = drawPermutation(rng, p.length);
        break;
    }
  }
  return out;
}

/** Substitutes `{{name}}` placeholders in the statement template. No eval —
 * arrays render space-joined, matching typical competitive-programming
 * problem statement conventions. */
export function renderStatement(template: string, parameters: DrawnParameters): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = parameters[name];
    if (value === undefined) return `{{${name}}}`;
    return Array.isArray(value) ? value.join(" ") : String(value);
  });
}
