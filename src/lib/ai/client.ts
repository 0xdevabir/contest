import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MessageParam, Usage } from "@anthropic-ai/sdk/resources/messages";
import type { z } from "zod";
import { log } from "../log";

/**
 * D1 (docs/phases/PHASE-15-intelligence.md) — one client, one model, for
 * every AI feature in this phase. `ANTHROPIC_API_KEY` is read by the SDK
 * itself; a missing key surfaces as a clear error from the first call
 * rather than at import time, so this module stays importable in tests
 * that never actually call the API.
 */
export const anthropic = new Anthropic();
export const MODEL = "claude-opus-5" as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Approximate USD-per-million-token rates, in cents, used only for the
 * AiJob.costCents estimate shown in /admin/costs — like src/lib/cost.ts,
 * this is a model, not a reconciled invoice. Update from Anthropic's
 * pricing page if it changes; a stale rate under- or over-estimates spend
 * but never breaks budget enforcement, which compares against this same
 * constant on both sides.
 */
const PRICE_CENTS_PER_MTOK = {
  input: 1_500,
  output: 7_500,
  cacheRead: 150,
  cacheWrite: 1_875,
} as const;

export function estimateCostCents(usage: Usage): number {
  const input = (usage.input_tokens / 1_000_000) * PRICE_CENTS_PER_MTOK.input;
  const output = (usage.output_tokens / 1_000_000) * PRICE_CENTS_PER_MTOK.output;
  const cacheRead = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * PRICE_CENTS_PER_MTOK.cacheRead;
  const cacheWrite = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * PRICE_CENTS_PER_MTOK.cacheWrite;
  return input + output + cacheRead + cacheWrite;
}

export type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costCents: number;
};

export function summarizeUsage(usage: Usage): UsageSummary {
  const cachedTokens = usage.cache_read_input_tokens ?? 0;
  if (cachedTokens === 0 && (usage.cache_creation_input_tokens ?? 0) === 0) {
    // D2's cost-control check: if a call that should hit the cache reports
    // zero cache_read_input_tokens, something in the stable prefix varies.
    // This is a signal, not a failure — logged so it's visible in practice.
    log.debug("ai call had no cache read/write — verify the stable prefix is unchanged", {});
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedTokens,
    costCents: estimateCostCents(usage),
  };
}

/**
 * A cacheable system prompt: `stable` (statement, reference solution,
 * authoring conventions — the same across repeat calls for one problem)
 * gets `cache_control: { type: "ephemeral" }`; `volatile` (the specific
 * question, a student's code) does not. Order matters — stable first.
 */
export function buildSystemBlocks(stable: string, volatile?: string) {
  const blocks: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] = [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
  ];
  if (volatile) blocks.push({ type: "text", text: volatile });
  return blocks;
}

export type StructuredCallInput<Schema extends z.ZodType> = {
  system: ReturnType<typeof buildSystemBlocks>;
  messages: MessageParam[];
  schema: Schema;
  schemaName: string;
  effort: Effort;
  maxTokens?: number;
};

export type StructuredCallResult<T> = {
  data: T;
  usage: UsageSummary;
  rawUsage: Usage;
};

/**
 * The one call shape every correctness-critical feature (testgen, editorial,
 * variant, translate, recommend-explain) goes through: adaptive thinking,
 * a tuned effort level, and a Zod-validated structured output — "never
 * parse free text into a data structure" (D1).
 */
export async function generateStructured<Schema extends z.ZodType>(
  input: StructuredCallInput<Schema>
): Promise<StructuredCallResult<z.infer<Schema>>> {
  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: input.maxTokens ?? 8_000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: input.effort,
      format: zodOutputFormat(input.schema),
    },
    system: input.system,
    messages: input.messages,
  });

  if (message.parsed_output == null) {
    throw new Error(`AI call for "${input.schemaName}" returned no parsed output`);
  }

  return {
    data: message.parsed_output,
    usage: summarizeUsage(message.usage),
    rawUsage: message.usage,
  };
}

export type StreamCallInput<Schema extends z.ZodType | undefined = undefined> = {
  system: ReturnType<typeof buildSystemBlocks>;
  messages: MessageParam[];
  effort: Effort;
  maxTokens?: number;
  /** When set, the stream's finalMessage().parsed_output is schema-validated —
   * used by hint.ts, where the *complete, validated* response must exist
   * before any of it can be shown to a student (D5's post-filter can't run
   * on a partial response). */
  schema?: Schema;
};

/**
 * User-facing streaming (hints, editorial drafts) — "so the teacher or
 * student sees progress rather than a spinner" (D1). Returns the SDK's
 * MessageStream; callers pipe `.textStream` to the client and await
 * `.finalMessage()` for usage accounting (and `.parsed_output`, when a
 * schema was given) once it's done.
 */
export function streamText<Schema extends z.ZodType | undefined = undefined>(input: StreamCallInput<Schema>) {
  return anthropic.messages.stream({
    model: MODEL,
    max_tokens: input.maxTokens ?? 2_000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: input.effort,
      format: input.schema ? zodOutputFormat(input.schema) : undefined,
    },
    system: input.system,
    messages: input.messages,
  });
}
