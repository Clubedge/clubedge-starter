import { z } from "zod";
import { createConsoleEmail, type EmailProvider } from "@clubedge/email";
import { createSmtpEmail } from "@clubedge/email-smtp";
import { optional, parseEnv } from "@/env";
import { withSpans } from "@clubedge/core";

export type { EmailMessage, EmailProvider } from "@clubedge/email";

// Email over SMTP: any provider's SMTP endpoint, or a local inbox such as Mailpit.
const emailEnvSchema = z.object({
  SMTP_URL: optional(z.url({ protocol: /^smtps?$/ })),
  EMAIL_FROM: z.string().default("App <no-reply@example.com>"),
});

/** Without a provider, development prints emails to the server log and production refuses. */
function fallback(): EmailProvider {
  if (process.env.NODE_ENV !== "production") return createConsoleEmail();
  return {
    async send() {
      throw new Error("Email is not configured: set SMTP_URL to send email in production.");
    },
  };
}

let provider: EmailProvider | undefined;

function resolveProvider(): EmailProvider {
  if (provider) return provider;
  const env = parseEnv(emailEnvSchema, "Email");
  provider = env.SMTP_URL
    ? createSmtpEmail({ url: env.SMTP_URL, from: env.EMAIL_FROM })
    : fallback();
  return provider;
}

/** The configured email provider, resolved on first use so imports stay side-effect free. */
export const email: EmailProvider = withSpans("email", {
  send: (message) => resolveProvider().send(message),
});
