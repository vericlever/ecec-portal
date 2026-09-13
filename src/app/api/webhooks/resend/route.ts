import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Resend signs webhook deliveries the same way Svix does: a shared secret
// (RESEND_WEBHOOK_SECRET, the "whsec_..." value from the Resend dashboard's
// webhook settings) signs "{svix-id}.{svix-timestamp}.{raw body}" with
// HMAC-SHA256. The header can carry more than one "v1,<sig>" entry - any
// match is accepted. Without the secret configured, every delivery is
// rejected rather than trusted unverified.
function verify(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;

  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatureHeader = req.headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest();

  return signatureHeader
    .split(" ")
    .some((entry) => {
      const [, sig] = entry.split(",");
      if (!sig) return false;
      let given: Buffer;
      try {
        given = Buffer.from(sig, "base64");
      } catch {
        return false;
      }
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

// Best-effort classification. Resend's bounce payload has not been
// confirmed against a live webhook delivery in this build (the sending
// domain is not yet verified) - if a future payload carries an explicit
// soft/transient marker this treats it as non-permanent, otherwise any
// bounce suppresses. A wrong address is a compliance gap, not a mail
// problem, so the safer default here is to suppress rather than stay silent.
function isHardBounce(data: Record<string, unknown>): boolean {
  const bounce = data.bounce as Record<string, unknown> | undefined;
  const marker = String(
    bounce?.type ?? bounce?.classification ?? data.bounce_type ?? "",
  ).toLowerCase();
  if (marker.includes("transient") || marker.includes("soft") || marker.includes("temporary")) {
    return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verify(req, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const type = event.type ?? "";
  const data = event.data ?? {};
  const emailId = data.email_id as string | undefined;
  if (!emailId) return NextResponse.json({ ok: true }); // nothing to correlate

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("notification_log")
    .select("id, recipient_profile_id")
    .eq("provider_message_id", emailId);

  if (!rows || rows.length === 0) return NextResponse.json({ ok: true });

  const now = new Date().toISOString();
  let update: Record<string, unknown> | null = null;
  let suppress: { reason: string } | null = null;

  switch (type) {
    case "email.delivered":
      update = { delivery_state: "delivered", delivered_at: now };
      break;
    case "email.bounced": {
      const hard = isHardBounce(data);
      update = {
        delivery_state: "bounced",
        failure_reason: (data.bounce as Record<string, unknown> | undefined)?.message
          ? String((data.bounce as Record<string, unknown>).message)
          : "Bounced",
      };
      if (hard) suppress = { reason: "Hard bounce via Resend webhook" };
      break;
    }
    case "email.complained":
      update = { delivery_state: "complained" };
      suppress = { reason: "Recipient marked the message as spam" };
      break;
    case "email.failed":
      update = {
        delivery_state: "failed",
        failure_reason: data.reason ? String(data.reason) : "Send failed",
      };
      break;
    case "email.sent":
      // Already logged as 'sent' at send time - nothing to do.
      return NextResponse.json({ ok: true });
    default:
      return NextResponse.json({ ok: true });
  }

  if (update) {
    await admin
      .from("notification_log")
      .update(update)
      .eq("provider_message_id", emailId);
  }

  if (suppress) {
    const profileIds = Array.from(
      new Set(rows.map((r) => r.recipient_profile_id as string | null).filter(Boolean)),
    ) as string[];
    for (const profileId of profileIds) {
      await admin
        .from("profiles")
        .update({
          email_suppressed_at: now,
          email_suppressed_reason: suppress.reason,
        })
        .eq("id", profileId)
        .is("email_suppressed_at", null);
    }
  }

  return NextResponse.json({ ok: true });
}
