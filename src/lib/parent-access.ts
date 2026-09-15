import { randomInt, createHmac, timingSafeEqual } from "node:crypto";

// Parent portal access: a single shared code per service, gating the public
// /parent/[serviceId] page. This is deliberately NOT modelled as Supabase Auth
// or as an anon-role RLS policy - see the note below - it is a shared "door
// code" a centre gives to any parent, checked entirely in trusted server code
// (Server Components / Server Actions / Route Handlers using the service-role
// client), the same way every document download in this app already works
// (src/lib/documents/store.ts's signedDocumentUrl, src/app/api/documents/
// [id]/route.ts). Nothing here ever hands a parent's browser a Supabase URL,
// anon key, or direct table access.
//
// Why not RLS + the anon key from the browser: every other public page in
// this app (the marketing site, /faq) never touches Supabase at all, and
// there is no existing anon-role RLS policy anywhere in this schema that
// returns real rows to an unauthenticated caller (every current RLS policy
// resolves through auth.uid()). Adding one for policies/documents - even
// tightly scoped to is_parent_facing + a matching service_id - would be the
// first crack in that door in a multi-tenant compliance app: the anon key and
// table/column names are always visible in the compiled client bundle, so a
// bug in that RLS policy (or a future migration that loosens it without
// realising this depended on it) could leak another organisation's policies.
// Keeping this fully server-mediated means the *only* thing that decides what
// a parent can see is this file's own code, reviewed like any other app
// logic, not a second enforcement layer that has to be independently kept in
// sync with it forever.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L - read
// aloud or typed from a printed notice, so ambiguous characters are dropped.
const CODE_LENGTH = 8;

export function generateParentCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

// Codes are compared case-insensitively and with surrounding whitespace
// trimmed - a parent typing this off a printed sign shouldn't be tripped up
// by shift-key slips.
export function normaliseParentCode(input: string): string {
  return input.trim().toUpperCase();
}

function secret(): string {
  const s = process.env.PARENT_ACCESS_SECRET;
  if (!s) {
    throw new Error(
      "Missing PARENT_ACCESS_SECRET (generate one, e.g. `openssl rand -hex 32`, and add it to .env.local / Vercel).",
    );
  }
  return s;
}

export function parentAccessCookieName(serviceId: string): string {
  return `pp_${serviceId}`;
}

// The cookie value is bound to the CURRENT code, not to "this service was
// once verified" - so regenerating a service's code (e.g. Admin hits Reset)
// silently invalidates every parent's existing cookie/bookmark, with no
// separate revocation list to maintain. A parent who still has the old code
// memorised, or a stale cookie, is simply asked to re-enter the new one.
export function signParentToken(serviceId: string, code: string): string {
  return createHmac("sha256", secret())
    .update(`${serviceId}:${normaliseParentCode(code)}`)
    .digest("hex");
}

export function verifyParentCookie(
  serviceId: string,
  currentCode: string,
  cookieValue: string | undefined,
): boolean {
  if (!cookieValue) return false;
  const expected = signParentToken(serviceId, currentCode);
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
