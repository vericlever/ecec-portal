import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, esc } from "@/lib/email";
import { logNotification, isEmailSuppressed } from "@/lib/notifications";

type ServerClient = ReturnType<typeof createClient>;

const BUCKET = "documents";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB, per the spec

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vericlever.site").replace(/\/+$/, "");
}

async function fetchSignedCopyForEmail(
  documentId: string,
): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("storage_path, file_name, byte_size")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || (doc.byte_size ?? 0) > MAX_ATTACHMENT_BYTES) return null;
  const { data, error } = await admin.storage.from(BUCKET).download(doc.storage_path);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), fileName: doc.file_name };
}

// Step 57, A6. Called after signOwnContract() + generateContractSignedCopy()
// succeed. A failed send never blocks or undoes a signature - callers wrap
// this in the same try/catch as the signed-copy generation itself.
export async function notifyContractSigned(supabase: ServerClient, contractId: string): Promise<void> {
  const { data: contract } = await supabase
    .from("contracts")
    .select("organisation_id, profile_id, requires_countersign, signed_copy_document_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || !contract.signed_copy_document_id) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", contract.profile_id)
    .maybeSingle();
  if (!profile) return;

  const { data: org } = await supabase
    .from("organisations")
    .select("name, display_name")
    .eq("id", contract.organisation_id)
    .maybeSingle();
  const orgName = (org?.display_name as string | null) || (org?.name as string | null) || "your employer";

  const suppressed = await isEmailSuppressed(contract.profile_id);
  if (!suppressed.suppressed) {
    const link = `${siteUrl()}/onboarding`;
    const copy = await fetchSignedCopyForEmail(contract.signed_copy_document_id);
    const subject = `Your ${orgName} employment contract - signed`;
    const text = contract.requires_countersign
      ? `Hi ${profile.full_name},\n\nYour signed contract is attached (or available at ${link} if this email arrived without it). It's now awaiting your employer's countersignature - we'll email you again once that's done.`
      : `Hi ${profile.full_name},\n\nYour signed contract is attached (or available at ${link} if this email arrived without it).`;
    const html = `<p>Hi ${esc(profile.full_name)},</p><p>Your signed contract is attached${copy ? "" : ` (<a href="${esc(link)}">view it in the portal</a> - it was too large to attach)`}.${contract.requires_countersign ? " It's now awaiting your employer's countersignature - we'll email you again once that's done." : ""}</p>`;

    const result = await sendEmail({
      to: profile.email,
      subject,
      html,
      text,
      attachments: copy ? [{ filename: copy.fileName, content: Buffer.from(copy.bytes).toString("base64") }] : undefined,
    });
    await logNotification({
      organisationId: contract.organisation_id,
      recipientProfileId: contract.profile_id,
      recipientEmail: profile.email,
      kind: "contract_signed",
      relatedObjectType: "contract",
      relatedObjectId: contractId,
      providerMessageId: result.ok ? result.id : null,
      deliveryState: result.ok ? "sent" : "failed",
      failureReason: result.ok ? undefined : result.error,
    });
  }

  if (contract.requires_countersign) {
    await notifyCountersignersNeeded(supabase, contractId, contract.organisation_id, profile.full_name);
  }
}

async function notifyCountersignersNeeded(
  supabase: ServerClient,
  contractId: string,
  organisationId: string,
  employeeName: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: countersigners } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("organisation_id", organisationId)
    .in("access_tier", ["admin", "manager_staff", "manager_policy"]);

  const link = `${siteUrl()}/admin/agreements`;
  for (const person of countersigners ?? []) {
    const suppressed = await isEmailSuppressed(person.id);
    if (suppressed.suppressed) continue;
    const subject = `${employeeName}'s contract needs countersigning`;
    const text = `Hi ${person.full_name},\n\n${employeeName} has signed their employment contract. It needs a countersignature - review it here: ${link}`;
    const html = `<p>Hi ${esc(person.full_name)},</p><p>${esc(employeeName)} has signed their employment contract. It needs a countersignature - <a href="${esc(link)}">review it here</a>.</p>`;
    const result = await sendEmail({ to: person.email, subject, html, text });
    await logNotification({
      organisationId,
      recipientProfileId: person.id,
      recipientEmail: person.email,
      kind: "contract_countersign_needed",
      relatedObjectType: "contract",
      relatedObjectId: contractId,
      providerMessageId: result.ok ? result.id : null,
      deliveryState: result.ok ? "sent" : "failed",
      failureReason: result.ok ? undefined : result.error,
    });
  }
}

// Called after countersignContract() + generateContractSignedCopy() succeed.
export async function notifyContractCountersigned(supabase: ServerClient, contractId: string): Promise<void> {
  const { data: contract } = await supabase
    .from("contracts")
    .select("organisation_id, profile_id, signed_copy_document_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || !contract.signed_copy_document_id) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", contract.profile_id)
    .maybeSingle();
  if (!profile) return;

  const suppressed = await isEmailSuppressed(contract.profile_id);
  if (suppressed.suppressed) return;

  const link = `${siteUrl()}/onboarding`;
  const copy = await fetchSignedCopyForEmail(contract.signed_copy_document_id);
  const subject = "Your employment contract is fully signed";
  const text = `Hi ${profile.full_name},\n\nYour employment contract has now been countersigned and is fully executed. The fully signed copy is attached (or available at ${link} if this email arrived without it).`;
  const html = `<p>Hi ${esc(profile.full_name)},</p><p>Your employment contract has now been countersigned and is fully executed. The fully signed copy is attached${copy ? "" : ` (<a href="${esc(link)}">view it in the portal</a> - it was too large to attach)`}.</p>`;

  const result = await sendEmail({
    to: profile.email,
    subject,
    html,
    text,
    attachments: copy ? [{ filename: copy.fileName, content: Buffer.from(copy.bytes).toString("base64") }] : undefined,
  });
  await logNotification({
    organisationId: contract.organisation_id,
    recipientProfileId: contract.profile_id,
    recipientEmail: profile.email,
    kind: "contract_countersigned",
    relatedObjectType: "contract",
    relatedObjectId: contractId,
    providerMessageId: result.ok ? result.id : null,
    deliveryState: result.ok ? "sent" : "failed",
    failureReason: result.ok ? undefined : result.error,
  });
}
