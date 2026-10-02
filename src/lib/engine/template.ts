import type { Contact } from "@prisma/client";
import type { RunContext } from "./run";

/**
 * Personalisation tokens, e.g. "Hey {{first_name}}, here's the {{keyword}} link!"
 *
 * Unknown tokens resolve to an empty string rather than leaking `{{...}}` into
 * a real DM. Tokens never execute anything — this is a lookup, not a template
 * language.
 */

export const AVAILABLE_TOKENS = [
  { token: "first_name", description: "The contact's first name", inBroadcasts: true },
  { token: "full_name", description: "The contact's full name", inBroadcasts: true },
  { token: "username", description: "Their Instagram @username", inBroadcasts: true },
  { token: "account_username", description: "Your Instagram @username", inBroadcasts: true },
  { token: "keyword", description: "The keyword that triggered this automation", inBroadcasts: false },
  { token: "trigger_text", description: "The comment or message they sent", inBroadcasts: false },
  { token: "coupon", description: "The coupon code they were issued", inBroadcasts: false },
] as const;

/**
 * What a broadcast can fill in: everything about the contact, nothing about a
 * flow run (there isn't one). Custom fields come on top, per account.
 */
export const BROADCAST_TOKENS = AVAILABLE_TOKENS.filter((t) => t.inBroadcasts);

/** Everything a token can be looked up from. A flow run is one of these. */
export type TemplateScope = {
  contact: Pick<Contact, "name" | "username" | "customFields">;
  account: { username: string };
  variables: Record<string, unknown>;
};

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderTemplate(input: string, ctx: RunContext | TemplateScope): string {
  if (!input.includes("{{")) return input;

  return input.replace(TOKEN, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = resolveToken(key, ctx);
    return value == null ? "" : String(value);
  });
}

/** Fill in a broadcast's tokens for one contact. */
export function renderForContact(
  input: string,
  contact: TemplateScope["contact"],
  account: TemplateScope["account"],
): string {
  return renderTemplate(input, { contact, account, variables: {} });
}

/** The token names used in a piece of text, e.g. ["first_name"]. */
export function tokensIn(input: string): string[] {
  return [...new Set([...input.matchAll(TOKEN)].map((m) => m[1].trim()))];
}

function resolveToken(key: string, ctx: TemplateScope): unknown {
  const fullName = ctx.contact.name ?? ctx.contact.username ?? "";

  switch (key) {
    case "first_name":
      return fullName.trim().split(/\s+/)[0] ?? "";
    case "full_name":
      return fullName;
    case "username":
      return ctx.contact.username ?? "";
    case "account_username":
      return ctx.account.username;
    case "keyword":
      return ctx.variables.keyword ?? "";
    case "trigger_text":
      return ctx.variables.trigger_text ?? "";
    default:
      break;
  }

  // Anything else: a collected variable, then a custom field.
  if (key in ctx.variables) return ctx.variables[key];

  const fields = (ctx.contact.customFields as Record<string, unknown>) ?? {};
  if (key in fields) return fields[key];

  const [head, ...rest] = key.split(".");
  if (rest.length && head in ctx.variables) {
    let cursor: unknown = ctx.variables[head];
    for (const part of rest) {
      if (cursor && typeof cursor === "object" && part in (cursor as object)) {
        cursor = (cursor as Record<string, unknown>)[part];
      } else {
        return "";
      }
    }
    return cursor;
  }

  return "";
}

/** Preview a template in the builder without a live run. */
export function previewTemplate(input: string, sample: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    first_name: "Alex",
    full_name: "Alex Rivera",
    username: "alexrivera",
    account_username: "yourbrand",
    keyword: "LINK",
    trigger_text: "LINK please!",
    coupon: "SAVE20-K7QP",
    ...sample,
  };
  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => defaults[key.trim()] ?? "");
}
