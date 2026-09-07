// Transactional email through Resend's REST API (no SDK dependency). Every
// send is best-effort: if Resend is not configured yet, callers fall back to
// showing the invite link on screen.

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

// Generic transactional send, used by the reminder engine. Same best-effort
// contract as the rest of this module.
export async function sendEmail(msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  return send(msg);
}

async function send(msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  if (!emailEnabled()) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY / RESEND_FROM)." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Resend responded ${res.status}: ${await res.text()}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendStaffInvite(opts: {
  to: string;
  fullName: string;
  link: string;
  orgName: string;
}): Promise<SendResult> {
  const firstName = opts.fullName.trim().split(/\s+/)[0] || "there";
  const subject = `Set up your ${opts.orgName} staff account`;

  const text = [
    `Hi ${firstName},`,
    ``,
    `${opts.orgName} has created a staff account for you on VeriClever, the`,
    `compliance and training portal.`,
    ``,
    `Set your password to get started:`,
    opts.link,
    ``,
    `If the link has expired, ask your administrator to send a new one.`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
  <p>Hi ${esc(firstName)},</p>
  <p>${esc(opts.orgName)} has created a staff account for you on VeriClever, the compliance and training portal.</p>
  <p style="margin:24px 0">
    <a href="${esc(opts.link)}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Set your password</a>
  </p>
  <p style="font-size:13px;color:#64748b">If the button does not work, copy this link into your browser:<br>${esc(opts.link)}</p>
  <p style="font-size:13px;color:#64748b">If the link has expired, ask your administrator to send a new one.</p>
</div>`;

  return send({ to: opts.to, subject, html, text });
}

export async function sendPasswordReset(opts: {
  to: string;
  fullName: string;
  link: string;
  triggeredByLeader: boolean;
}): Promise<SendResult> {
  const firstName = opts.fullName.trim().split(/\s+/)[0] || "there";
  const subject = "Reset your VeriClever password";

  const reason = opts.triggeredByLeader
    ? "Your administrator has started a password reset for your VeriClever account."
    : "We received a request to reset the password for your VeriClever account.";

  const text = [
    `Hi ${firstName},`,
    ``,
    reason,
    ``,
    `Set a new password:`,
    opts.link,
    ``,
    `If you did not expect this, you can ignore this email. The link expires`,
    `after a short time and can only be used once.`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
  <p>Hi ${esc(firstName)},</p>
  <p>${esc(reason)}</p>
  <p style="margin:24px 0">
    <a href="${esc(opts.link)}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Set a new password</a>
  </p>
  <p style="font-size:13px;color:#64748b">If the button does not work, copy this link into your browser:<br>${esc(opts.link)}</p>
  <p style="font-size:13px;color:#64748b">If you did not expect this, you can ignore this email. The link expires after a short time and can only be used once.</p>
</div>`;

  return send({ to: opts.to, subject, html, text });
}
