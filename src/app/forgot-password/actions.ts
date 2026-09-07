"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { generatePasswordResetLink } from "@/lib/invite";
import { emailEnabled, sendPasswordReset } from "@/lib/email";

export type ForgotState = { done: boolean; devLink?: string };

// Self-service reset. We never say whether the address has an account: the
// response is the same either way. An audit row is written only when a real
// account matches, and only server-side.
export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    // Same neutral outcome even for a malformed address.
    return { done: true };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, organisation_id, full_name, email")
    .ilike("email", email)
    .maybeSingle();

  if (!profile) {
    return { done: true };
  }

  const link = await generatePasswordResetLink(profile.email as string);
  let emailSent = false;
  let devLink: string | undefined;

  if (link.ok) {
    if (emailEnabled()) {
      const sent = await sendPasswordReset({
        to: profile.email as string,
        fullName: (profile.full_name as string) ?? "",
        link: link.link,
        triggeredByLeader: false,
      });
      emailSent = sent.ok;
    }
    // In development, surface the link on screen whenever it did not actually
    // get emailed (no provider, or a sandbox rejection), so the flow stays
    // testable. Never in production.
    if (!emailSent && process.env.NODE_ENV !== "production") {
      devLink = link.link;
    }
  }

  await admin.from("password_reset_requests").insert({
    organisation_id: profile.organisation_id,
    target_email: profile.email,
    target_profile_id: profile.id,
    requested_by_profile_id: null,
    source: "self",
    email_sent: emailSent,
  });

  return { done: true, devLink };
}
