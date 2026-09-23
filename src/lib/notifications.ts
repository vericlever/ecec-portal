import { createAdminClient } from "@/lib/supabase/admin";

// Step 45: the evidence layer. Every outbound notification the product
// sends - not just the reminder digest - writes one row here, so "reminded
// four times, last on 3 October, delivered" is something the record can
// actually say. delivery_state starts at 'sent' (or 'suppressed'/'failed')
// and is only ever moved to 'delivered', 'bounced' or 'complained' by the
// Resend webhook - never assumed from the send call returning 200.

export type NotificationKind =
  | "staff_digest"
  | "manager_digest"
  | "account_created"
  | "password_reset"
  // Step 57
  | "contract_signed"
  | "contract_countersign_needed"
  | "contract_countersigned";

export async function isEmailSuppressed(
  profileId: string,
): Promise<{ suppressed: boolean; reason: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("email_suppressed_at, email_suppressed_reason")
    .eq("id", profileId)
    .maybeSingle();
  return {
    suppressed: Boolean(data?.email_suppressed_at),
    reason: (data?.email_suppressed_reason as string | null) ?? null,
  };
}

export async function logNotification(opts: {
  organisationId: string;
  recipientProfileId?: string | null;
  recipientEmail: string;
  kind: NotificationKind;
  triggerReason?: string;
  relatedProfileId?: string;
  relatedObjectType?: string;
  relatedObjectId?: string;
  providerMessageId?: string | null;
  deliveryState: "sent" | "failed" | "suppressed";
  failureReason?: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("notification_log").insert({
    organisation_id: opts.organisationId,
    recipient_profile_id: opts.recipientProfileId ?? null,
    recipient_email: opts.recipientEmail,
    kind: opts.kind,
    trigger_reason: opts.triggerReason ?? null,
    related_profile_id: opts.relatedProfileId ?? null,
    related_object_type: opts.relatedObjectType ?? null,
    related_object_id: opts.relatedObjectId ?? null,
    provider_message_id: opts.providerMessageId ?? null,
    delivery_state: opts.deliveryState,
    failure_reason: opts.failureReason ?? null,
  });
}
