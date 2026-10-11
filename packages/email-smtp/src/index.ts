import { createTransport } from "nodemailer";
import { parseSender, type EmailProvider } from "@clubedge/email";

export interface SmtpEmailConfig {
  /** smtp://user:password@host:port, or smtps:// for TLS from the start. */
  url: string;
  /** The sender, as "Name <address>" or an address. */
  from: string;
}

/** Sends through any SMTP server: a provider's SMTP endpoint, or a local inbox such as Mailpit. */
export function createSmtpEmail({ url, from }: SmtpEmailConfig): EmailProvider & {
  /** Connects and authenticates without sending anything, for `pnpm check:services`. */
  verify(): Promise<void>;
} {
  const sender = parseSender(from);
  const transport = createTransport(url);
  return {
    async send({ to, subject, text, html }) {
      await transport.sendMail({ from: sender, to, subject, text, ...(html ? { html } : {}) });
    },
    async verify() {
      await transport.verify();
    },
  };
}
