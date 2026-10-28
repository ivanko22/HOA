export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { sent: true; provider: "resend" | "log" }
  | { sent: false; provider: "none"; reason: string };

/**
 * Optional outbound email. Uses Resend when RESEND_API_KEY is set; otherwise
 * logs the message (invite link still shown to the inviting admin).
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM || "Community OS <noreply@community-os.local>";

  if (!apiKey) {
    console.info("[mail] RESEND_API_KEY unset — invite not emailed:", {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return {
      sent: false,
      provider: "none",
      reason: "RESEND_API_KEY not configured",
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<pre>${input.text}</pre>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[mail] Resend failed", res.status, body);
    return {
      sent: false,
      provider: "none",
      reason: `Resend HTTP ${res.status}`,
    };
  }

  return { sent: true, provider: "resend" };
}

export function appBaseUrl(): string {
  return (
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
