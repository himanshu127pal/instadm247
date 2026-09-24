import type Anthropic from "@anthropic-ai/sdk";

/**
 * What the AI Helper's model calls cost, and the most any one call can cost.
 * See docs/HELPER.md §Cost.
 *
 * The helper never makes a call without first reserving its WORST-CASE cost
 * against the workspace's monthly cap, so the cap is a guarantee rather than an
 * estimate. That needs two things this file provides: a price for the model
 * (an unknown model can't be bounded, so the helper refuses to run on one), and
 * an upper bound on a call's tokens that holds whatever the customer typed.
 */

/** US dollars per million tokens, from Anthropic's published price list. */
type Price = { input: number; output: number };

const PRICES: Record<string, Price> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Writing the prompt cache costs 1.25× input (5-minute TTL); reading it, 0.1×. */
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

export function modelPrice(model: string): Price | null {
  return PRICES[model] ?? null;
}

/**
 * The most a call can cost, in micro-dollars.
 *
 * Every token covers at least one byte of the text it encodes, so a request's
 * UTF-8 size is an upper bound on its input tokens — for any language, emoji or
 * junk. The fixed overhead covers what the API adds around messages and tools.
 * Thinking carried between rounds of one question is billed as input but has no
 * text we can measure, so the output tokens of earlier rounds are added on top.
 * Everything is priced as a cache write, the dearest way an input token can be
 * billed; the output at `max_tokens`, which caps thinking and text together.
 *
 * When the fixed prefix's exact size is known (the API reports it on the first
 * call), it's used instead of its byte count — same bound, less pessimistic.
 */
const OVERHEAD_TOKENS = 2_000;

export function worstCaseMicros(params: {
  price: Price;
  /** The cacheable prefix: system prompt block and tools. */
  prefixText: string;
  /** Exact token count of that prefix, once the API has reported it. */
  prefixTokens?: number;
  /** Everything else sent: the per-request system block and the messages. */
  restText: string;
  /** Output tokens of earlier rounds in this question (their thinking comes back as input). */
  priorOutputTokens: number;
  maxTokens: number;
}): number {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  const prefix = params.prefixTokens ?? bytes(params.prefixText);
  const input = prefix + bytes(params.restText) + params.priorOutputTokens + OVERHEAD_TOKENS;
  return input * params.price.input * CACHE_WRITE + params.maxTokens * params.price.output;
}

/** What a finished call actually cost, in micro-dollars, from the API's own usage report. */
type BilledUsage = Pick<
  Anthropic.Beta.BetaUsage,
  "input_tokens" | "output_tokens" | "cache_creation_input_tokens" | "cache_read_input_tokens"
>;

export function actualMicros(price: Price, usage: BilledUsage): number {
  return (
    (usage.input_tokens ?? 0) * price.input +
    (usage.cache_creation_input_tokens ?? 0) * price.input * CACHE_WRITE +
    (usage.cache_read_input_tokens ?? 0) * price.input * CACHE_READ +
    (usage.output_tokens ?? 0) * price.output
  );
}
