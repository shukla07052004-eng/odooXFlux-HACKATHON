type AuthEmail = { email: string; name: string; code: string };

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

async function sendEmail({ email, name, code, reset }: AuthEmail & { reset: boolean }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured: set RESEND_API_KEY.");
  const from = process.env.RESEND_FROM_EMAIL ?? "Brightloop Software <onboarding@resend.dev>";
  const subject = reset ? "Your Brightloop password reset code" : "Verify your Brightloop email";
  const purpose = reset ? "reset your password" : "verify your email address";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#182230"><p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#5269e8">BRIGHTLOOP SOFTWARE</p><h1 style="font-size:24px">${reset ? "Password reset" : "Verify your email"}</h1><p>Hello ${escapeHtml(name)},</p><p>Use this one-time code to ${purpose}:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;padding:16px 20px;background:#f4f5fa;border-radius:8px;display:inline-block">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>`,
      text: `Hello ${name}, your Brightloop code to ${purpose} is ${code}. It expires in 10 minutes.`,
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(`Resend rejected the email (${response.status}): ${payload?.message ?? "delivery failed"}`);
}

export function sendVerificationEmail(input: AuthEmail) {
  return sendEmail({ ...input, reset: false });
}

export function sendPasswordResetEmail(input: AuthEmail) {
  return sendEmail({ ...input, reset: true });
}

export async function sendPasswordResetLink(input: { email: string; name: string; resetUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured: set RESEND_API_KEY.");
  const from = process.env.RESEND_FROM_EMAIL ?? "Brightloop Software <onboarding@resend.dev>";
  const safeUrl = escapeHtml(input.resetUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Reset your Brightloop password",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#182230"><p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#5269e8">BRIGHTLOOP SOFTWARE</p><h1 style="font-size:24px">Password reset</h1><p>Hello ${escapeHtml(input.name)},</p><p>Use this one-time link to choose a new password. It expires in 60 minutes.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">Reset password</a></p><p>If you did not request this, you can ignore this email.</p></div>`,
      text: `Hello ${input.name}, reset your Brightloop password using this one-time link (expires in 60 minutes): ${input.resetUrl}`,
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(`Resend rejected the email (${response.status}): ${payload?.message ?? "delivery failed"}`);
}

export async function sendInvoiceEmail(input: { email: string; name: string; invoiceNumber: string; total: string; dueDate: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured: set RESEND_API_KEY.");
  const from = process.env.RESEND_FROM_EMAIL ?? "Brightloop Software <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `Brightloop invoice ${input.invoiceNumber}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#182230"><p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#5269e8">BRIGHTLOOP SOFTWARE</p><h1 style="font-size:24px">Invoice ${escapeHtml(input.invoiceNumber)}</h1><p>Hello ${escapeHtml(input.name)},</p><p>Your invoice total is <b>${escapeHtml(input.total)}</b>, due ${escapeHtml(input.dueDate)}.</p><p>Please sign in to your Brightloop account to view invoice details and payment history.</p></div>`,
      text: `Hello ${input.name}, your Brightloop invoice ${input.invoiceNumber} totals ${input.total} and is due ${input.dueDate}. Sign in to your account to view details.`,
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(`Resend rejected the email (${response.status}): ${payload?.message ?? "delivery failed"}`);
}
