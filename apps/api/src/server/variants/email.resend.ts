import { z } from "zod";
import { createConsoleEmail, type EmailProvider } from "@clubedge/email";
import { createResendEmail } from "@clubedge/email-resend";
import { optional, parseEnv } from "@/env";
import { withSpans } from "@clubedge/core";

export type { EmailMessage, EmailProvider } from "@clubedge/email";

// Email through Resend's API. EMAIL_FROM must use a domain verified in Resend.
const emailEnvSchema = z.object({
  RESEND_API_KEY: optional(z.string()),
  EMAIL_FROM: z.string().default("App <no-reply@example.com>"),
});

/** Without a provider, development prints emails to the server log and production refuses. */
function fallback(): EmailProvider {
  if (process.env.NODE_ENV !== "production") return createConsoleEmail();
  return {
    async send() {
      throw new Error("Email is not configured: set RESEND_API_KEY to send email in production.");
    },
  };
}

let provider: EmailProvider | undefined;

function resolveProvider(): EmailProvider {
  if (provider) return provider;
  const env = parseEnv(emailEnvSchema, "Email");
  provider = env.RESEND_API_KEY
    ? createResendEmail({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
    : fallback();
  return provider;
}

/** The configured email provider, resolved on first use so imports stay side-effect free. */
export const email: EmailProvider = withSpans("email", {
  send: (message) => resolveProvider().send(message),
});
