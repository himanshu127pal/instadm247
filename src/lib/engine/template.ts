import type { RunContext } from "./run";

/**
 * Personalisation tokens, e.g. "Hey {{first_name}}, here's the {{keyword}} link!"
 *
 * Unknown tokens resolve to an empty string rather than leaking `{{...}}` into
 * a real DM. Tokens never execute anything — this is a lookup, not a template
 * language.
 */

export const AVAILABLE_TOKENS = [
  { token: "first_name", description: "The contact's first name" },
  { token: "full_name", description: "The contact's full name" },
  { token: "username", description: "Their Instagram @username" },
  { token: "keyword", description: "The keyword that triggered this automation" },
  { token: "trigger_text", description: "The comment or message they sent" },
  { token: "account_username", description: "Your Instagram @username" },
] as const;

export function renderTemplate(input: string, ctx: RunContext): string {
  if (!input.includes("{{")) return input;

  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = resolveToken(key, ctx);
    return value == null ? "" : String(value);
  });
}

function resolveToken(key: string, ctx: RunContext): unknown {
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
    ...sample,
  };
  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => defaults[key.trim()] ?? "");
}
